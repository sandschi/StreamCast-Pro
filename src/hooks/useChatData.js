'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import tmi from 'tmi.js';
import { useAuth } from '@/context/AuthContext';
import { fetchThirdPartyEmotes, parseTwitchMessage } from '@/lib/emote-engine';
import { supabase } from '@/lib/supabase';
import { computeExpiresAt } from '@/lib/activeMessage';
import posthog from 'posthog-js';

// Extracted verbatim from the original inline logic in components/dashboard/Chat.js
// so both the classic and dashboard-shell presentations run the exact same real
// tmi.js/Supabase wiring rather than duplicating it. No behavior changes.
export function useChatData({ targetUid, userRole, enabled = true }) {
    const { user } = useAuth();
    const effectiveUid = useMemo(() => (enabled ? (targetUid || user?.id) : null), [enabled, targetUid, user?.id]);
    // One explicit predicate for every queue read/write/expiry/promotion below,
    // instead of each site separately excluding just 'viewer' - that left
    // 'denied' (and any future non-moderator role) able to subscribe to and
    // interact with the queue even though queueMessage() itself already
    // excludes both.
    const canManageQueue = userRole === 'broadcaster' || userRole === 'mod';

    const [messages, setMessages] = useState([]);
    const [thirdPartyEmotes, setThirdPartyEmotes] = useState({ sevenTV: [], bttv: [], ffz: [] });
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [channelName, setChannelName] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [activeMessage, setActiveMessage] = useState(null);
    const [queuedMessages, setQueuedMessages] = useState([]);
    const [displayDuration, setDisplayDuration] = useState(5);

    const clientRef = useRef(null);
    const connectingRef = useRef(false);
    const lastFetchedIdRef = useRef(null);
    const emotesRef = useRef({ sevenTV: [], bttv: [], ffz: [] });
    const channelRef = useRef(null);
    // The tmi.js client is (re)created only when channelName/reconnectNonce
    // change, not on every canManageQueue change - so the CLEARMSG/timeout
    // handlers registered on it read canManageQueue through this ref rather
    // than closing over a stale value from whenever connect() ran (a
    // permission change should apply to an already-connected client
    // immediately). The equivalent uid used to be read the same way, but
    // that was wrong in the other direction: see connect() below.
    const canManageQueueRef = useRef(canManageQueue);
    const [reconnectNonce, setReconnectNonce] = useState(0);
    const reconnect = () => setReconnectNonce(n => n + 1);

    // Cache to prevent redundant avatar fetches in a single session
    const avatarCache = useRef({});

    useEffect(() => {
        emotesRef.current = thirdPartyEmotes;
    }, [thirdPartyEmotes]);

    useEffect(() => {
        canManageQueueRef.current = canManageQueue;
    }, [canManageQueue]);

    // Deletes every stored copy of one Twitch message (history, still-queued,
    // and the currently-live overlay message) after Twitch reports it deleted
    // via CLEARMSG. Deliberately per-message rather than reacting to a bare
    // CLEARCHAT (full chat clear) too - honoring "you deleted it on Twitch, so
    // it's gone here" shouldn't also mean a mod running /clear wipes a
    // streamer's entire re-air history as a side effect.
    const deleteMessagesByTwitchId = async (uid, twitchMessageId) => {
        if (!uid || !twitchMessageId || !supabase) return;
        try {
            await Promise.all([
                supabase.from('history').delete().eq('user_id', uid).eq('twitch_message_id', twitchMessageId),
                supabase.from('message_queue').delete().eq('user_id', uid).eq('twitch_message_id', twitchMessageId),
                supabase.from('suggestions').delete().eq('user_id', uid).eq('payload->>twitchMessageId', twitchMessageId),
            ]);
            const { data: active } = await supabase.from('active_message').select('payload').eq('user_id', uid).maybeSingle();
            if (active?.payload?.twitchMessageId === twitchMessageId) {
                await supabase.from('active_message').delete().eq('user_id', uid);
            }
        } catch (e) { console.error('Error deleting message after Twitch CLEARMSG:', e); }
    };

    // Same idea for a user timeout/ban (CLEARCHAT with a target user) -
    // removes everything stored under that Twitch login, matching Twitch's
    // own "this person's messages are gone" behavior.
    const deleteMessagesByLogin = async (uid, login) => {
        if (!uid || !login || !supabase) return;
        try {
            await Promise.all([
                supabase.from('history').delete().eq('user_id', uid).eq('login', login),
                supabase.from('message_queue').delete().eq('user_id', uid).eq('login', login),
                supabase.from('suggestions').delete().eq('user_id', uid).eq('payload->>login', login),
            ]);
            const { data: active } = await supabase.from('active_message').select('payload').eq('user_id', uid).maybeSingle();
            if (active?.payload?.login === login) {
                await supabase.from('active_message').delete().eq('user_id', uid);
            }
        } catch (e) { console.error('Error deleting messages after Twitch timeout/ban:', e); }
    };

    const displayMessages = useMemo(() => {
        return messages.map(msg => ({
            ...msg,
            fragments: parseTwitchMessage(msg.message, msg.rawEmotes, thirdPartyEmotes)
        }));
    }, [messages, thirdPartyEmotes]);

    useEffect(() => {
        if (!user || !effectiveUid || !supabase) return;
        let active = true;
        const fetchUserData = async () => {
            try {
                const { data } = await supabase.from('users').select('twitch_username, display_name, twitch_id').eq('id', effectiveUid).maybeSingle();
                if (!active || !data) return;
                const name = (data.twitch_username || data.display_name || (effectiveUid === user.id ? user.user_metadata?.name : null))?.toLowerCase().trim();
                if (name && name !== channelRef.current) {
                    channelRef.current = name;
                    setChannelName(name);
                }
                const bId = data.twitch_id || (effectiveUid === user.id ? (user.user_metadata?.provider_id || user.user_metadata?.sub) : null);
                if (bId && lastFetchedIdRef.current !== bId) {
                    lastFetchedIdRef.current = bId;
                    const fetched = await fetchThirdPartyEmotes(bId);
                    if (active) setThirdPartyEmotes(fetched);
                }
            } catch (e) { console.error(e); }
        };
        fetchUserData();
        return () => { active = false; };
    }, [user, effectiveUid]);

    useEffect(() => {
        if (!user || !channelName || connectingRef.current) return;
        const connect = async () => {
            if (clientRef.current) {
                try { clientRef.current.removeAllListeners(); await clientRef.current.disconnect(); } catch (e) { }
            }
            connectingRef.current = true;
            setConnectionStatus('connecting');
            // Captured once, here, rather than read live via a ref inside the
            // handlers below - this client is only ever subscribed to
            // `channelName`, so its moderation events must always resolve
            // back to whichever broadcaster that channel belonged to when
            // THIS client was created. A mod switching hosted channels
            // updates effectiveUid (and eventually channelName, once the
            // async username lookup resolves) before this client actually
            // gets torn down and replaced - reading effectiveUid live here
            // could attribute an old channel's CLEARMSG/timeout/ban event to
            // whichever broadcaster the mod has since switched to.
            const connectedUid = effectiveUid;
            const client = new tmi.Client({ connection: { secure: true, reconnect: true }, channels: [channelName] });
            clientRef.current = client;
            client.on('connected', () => { setConnectionStatus('connected'); connectingRef.current = false; });

            // Rules already restrict these writes to isChannelModerator, so a
            // viewer's own dashboard session hitting this would just fail
            // server-side - checking canManageQueueRef here just avoids that
            // pointless attempt rather than being the actual security boundary.
            client.on('messagedeleted', (channel, username, deletedMessage, userstate) => {
                if (!canManageQueueRef.current) return;
                const targetMsgId = userstate?.['target-msg-id'];
                if (targetMsgId) deleteMessagesByTwitchId(connectedUid, targetMsgId);
            });
            client.on('timeout', (channel, username) => {
                if (!canManageQueueRef.current) return;
                deleteMessagesByLogin(connectedUid, username);
            });
            client.on('ban', (channel, username) => {
                if (!canManageQueueRef.current) return;
                deleteMessagesByLogin(connectedUid, username);
            });

            client.on('message', async (channel, tags, message) => {
                const login = tags.username;
                const displayName = tags['display-name'] || login;

                const placeholder = null;

                const newMessage = {
                    id: tags.id || Math.random().toString(36).substr(2, 9),
                    username: displayName,
                    login: login,
                    avatarUrl: avatarCache.current[login] || placeholder,
                    color: tags.color || '#efeff1',
                    message,
                    rawEmotes: tags.emotes,
                    fragments: parseTwitchMessage(message, tags.emotes, emotesRef.current),
                    timestamp: new Date(),
                    isMod: tags.mod || tags.badges?.broadcaster === '1',
                };

                setMessages(prev => [...prev.slice(-49), newMessage]);

                // 2. Background Resolve (Real Twitch Avatar via IVR.fi)
                if (!avatarCache.current[login]) {
                    try {
                        const response = await fetch(`https://api.ivr.fi/v2/twitch/user?login=${login}`);
                        const data = await response.json();
                        const realUrl = data?.[0]?.logo;
                        if (realUrl) {
                            avatarCache.current[login] = realUrl;
                            setMessages(prev => prev.map(m => m.login === login ? { ...m, avatarUrl: realUrl } : m));
                        }
                    } catch (e) {
                        console.warn(`Avatar fetch failed for ${login}`);
                    }
                }
            });
            try { await client.connect(); } catch (err) { setConnectionStatus('error'); connectingRef.current = false; }
        };
        connect();
        return () => { if (clientRef.current) { clientRef.current.removeAllListeners(); clientRef.current.disconnect().catch(() => { }); } connectingRef.current = false; };
        // effectiveUid is deliberately omitted - connect() reads it once into
        // connectedUid at call time (see above), and this effect must not
        // re-run just because effectiveUid changed ahead of channelName; it
        // already re-runs once the channelName lookup for the new uid lands.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, channelName, reconnectNonce]);

    useEffect(() => {
        if (!effectiveUid || !supabase || userRole === 'viewer') return;

        const mapSuggestion = (row) => ({ id: row.id, ...row.payload, submittedBy: row.submitted_by, timestamp: row.created_at });
        const sortDesc = (list) => [...list].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        supabase.from('suggestions').select('*').eq('user_id', effectiveUid)
            .then(({ data }) => setSuggestions(sortDesc((data || []).map(mapSuggestion))));

        const channel = supabase
            .channel(`chat-data-suggestions-${effectiveUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'suggestions', filter: `user_id=eq.${effectiveUid}` }, (payload) => {
                setSuggestions((prev) => {
                    if (payload.eventType === 'DELETE') return prev.filter(s => s.id !== payload.old.id);
                    const row = mapSuggestion(payload.new);
                    const idx = prev.findIndex(s => s.id === row.id);
                    const next = idx === -1 ? [...prev, row] : prev.map((s, i) => i === idx ? row : s);
                    return sortDesc(next);
                });
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [effectiveUid, userRole]);

    // Listen for active message to show Hide button
    useEffect(() => {
        if (!effectiveUid || !supabase) return;
        const applyActiveMessage = (row) => {
            setActiveMessage(row ? { ...row.payload, __expiresAt: row.expires_at } : null);
        };
        supabase.from('active_message').select('*').eq('user_id', effectiveUid).maybeSingle()
            .then(({ data }) => applyActiveMessage(data));
        const channel = supabase
            .channel(`chat-data-active-message-${effectiveUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'active_message', filter: `user_id=eq.${effectiveUid}` }, (payload) => {
                applyActiveMessage(payload.eventType === 'DELETE' ? null : payload.new);
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [effectiveUid]);

    // Listen for the pending "show next" queue, oldest first.
    useEffect(() => {
        if (!effectiveUid || !supabase || !canManageQueue) return;
        const mapRow = (row) => ({ id: row.id, ...row.payload, twitchMessageId: row.twitch_message_id, login: row.login, queuedAt: row.queued_at });
        const sortAsc = (list) => [...list].sort((a, b) => new Date(a.queuedAt) - new Date(b.queuedAt));

        supabase.from('message_queue').select('*').eq('user_id', effectiveUid).order('queued_at', { ascending: true })
            .then(({ data }) => setQueuedMessages((data || []).map(mapRow)));

        const channel = supabase
            .channel(`chat-data-queue-${effectiveUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'message_queue', filter: `user_id=eq.${effectiveUid}` }, (payload) => {
                setQueuedMessages((prev) => {
                    if (payload.eventType === 'DELETE') return prev.filter(m => m.id !== payload.old.id);
                    const row = mapRow(payload.new);
                    const idx = prev.findIndex(m => m.id === row.id);
                    const next = idx === -1 ? [...prev, row] : prev.map((m, i) => i === idx ? row : m);
                    return sortAsc(next);
                });
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [effectiveUid, canManageQueue]);

    // Needed to know how long a new active message should stay up - the
    // pg_cron+trigger pair in supabase/schema/0003_cron.sql owns the actual
    // expiry/promotion now (see 0003_cron.sql), so this hook only needs
    // displayDuration to compute expires_at up front when writing a message,
    // not to run its own expiry timer anymore.
    useEffect(() => {
        if (!effectiveUid || !supabase) return;
        supabase.from('settings').select('display_duration').eq('user_id', effectiveUid).maybeSingle()
            .then(({ data }) => { if (typeof data?.display_duration === 'number') setDisplayDuration(data.display_duration); });
        const channel = supabase
            .channel(`chat-data-settings-${effectiveUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${effectiveUid}` }, (payload) => {
                if (payload.eventType !== 'DELETE' && typeof payload.new?.display_duration === 'number') setDisplayDuration(payload.new.display_duration);
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [effectiveUid]);

    const hideOverlay = async () => {
        if (!effectiveUid || !supabase) return;
        try {
            await supabase.from('active_message').delete().eq('user_id', effectiveUid);
        } catch (e) { console.error("Error hiding:", e); }
    };

    const sendToScreen = async (msg, permanent = false) => {
        if (!user || !supabase || userRole === 'denied') return;

        const isViewer = userRole === 'viewer';
        const payload = {
            username: msg.username,
            login: msg.login,
            avatarUrl: msg.avatarUrl,
            color: msg.color,
            fragments: msg.fragments,
            suggestedBy: user.id,
            suggestedByName: user.user_metadata?.name,
            // Twitch's own message id (tags.id from the live chat event, see
            // above) - kept so a later CLEARMSG for this message can find and
            // delete every stored copy of it. Absent for anything that didn't
            // originate from a live tmi.js message (e.g. the Settings tab's
            // synthetic test message).
            twitchMessageId: msg.id || null,
        };

        try {
            if (isViewer) {
                await supabase.from('suggestions').insert({ user_id: effectiveUid, submitted_by: user.id, payload });
                console.log('Suggestion Sent ✅');
            } else {
                // MODS/BROADCASTER: Send directly to screen
                const finalPayload = { ...payload, activeId: crypto.randomUUID() };
                const expiresAt = computeExpiresAt(displayDuration, permanent);

                await supabase.from('active_message').upsert({ user_id: effectiveUid, payload: finalPayload, expires_at: expiresAt }, { onConflict: 'user_id' });
                await supabase.from('history').insert({ user_id: effectiveUid, twitch_message_id: finalPayload.twitchMessageId, login: finalPayload.login, payload: finalPayload });
                posthog.capture('message_sent', { permanent });
                console.log('Sent to Screen ✅');
            }
        } catch (e) { console.error(e); }
    };

    // Mods/broadcaster only (viewers already have "suggest" for the
    // not-direct-to-screen case). Adds to message_queue instead of writing
    // active_message directly - the AFTER DELETE trigger on active_message
    // (supabase/schema/0003_cron.sql) shows it immediately if nothing's
    // currently on screen, or once the current message's time is up.
    // `duration` is baked into the payload at queue time (rather than left
    // absent, the way the old client-timer version could get away with) -
    // the promotion trigger reads payload->>'duration' to compute the
    // promoted message's expires_at, and treats an absent/non-positive value
    // as permanent, so this must always carry a concrete value.
    const queueMessage = async (msg, permanent = false) => {
        if (!user || !supabase || !canManageQueue) return;

        const payload = {
            username: msg.username,
            login: msg.login,
            avatarUrl: msg.avatarUrl,
            color: msg.color,
            fragments: msg.fragments,
            suggestedBy: user.id,
            suggestedByName: user.user_metadata?.name,
            twitchMessageId: msg.id || null,
            duration: permanent ? -1 : displayDuration,
        };

        try {
            await supabase.from('message_queue').insert({ user_id: effectiveUid, twitch_message_id: payload.twitchMessageId, login: payload.login, payload });
            posthog.capture('message_queued', { permanent });
            console.log('Queued ✅');
        } catch (e) { console.error(e); }
    };

    const removeFromQueue = async (queueId) => {
        if (!effectiveUid || !supabase || !canManageQueue) return;
        try {
            await supabase.from('message_queue').delete().eq('id', queueId);
        } catch (e) { console.error('Error removing from queue:', e); }
    };

    const approveSuggestion = async (sug) => {
        if (!supabase) return;
        try {
            const { id, submittedBy, timestamp, ...rest } = sug;
            const finalPayload = { ...rest, activeId: crypto.randomUUID() };
            const expiresAt = computeExpiresAt(displayDuration, false);

            await supabase.from('active_message').upsert({ user_id: effectiveUid, payload: finalPayload, expires_at: expiresAt }, { onConflict: 'user_id' });
            await supabase.from('history').insert({ user_id: effectiveUid, twitch_message_id: finalPayload.twitchMessageId || null, login: finalPayload.login || null, payload: finalPayload });
            await supabase.from('suggestions').delete().eq('id', id);
        } catch (e) { console.error(e); }
    };

    const denySuggestion = async (sugId) => {
        if (!supabase) return;
        try {
            await supabase.from('suggestions').delete().eq('id', sugId);
        } catch (e) { console.error(e); }
    };

    // Local-only: the live chat log is ephemeral React state, not persisted
    // anywhere (a page reload already clears it), so clearing it needs no
    // write.
    const clearMessages = () => setMessages([]);

    return {
        effectiveUid,
        displayMessages,
        connectionStatus,
        channelName,
        suggestions,
        activeMessage,
        queuedMessages,
        hideOverlay,
        sendToScreen,
        queueMessage,
        removeFromQueue,
        approveSuggestion,
        denySuggestion,
        reconnect,
        clearMessages,
    };
}
