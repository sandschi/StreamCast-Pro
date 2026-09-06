'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import tmi from 'tmi.js';
import { useAuth } from '@/context/AuthContext';
import { fetchThirdPartyEmotes, parseTwitchMessage } from '@/lib/emote-engine';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, setDoc, addDoc, serverTimestamp, onSnapshot, deleteDoc, query, where, getDocs, writeBatch, orderBy, runTransaction } from 'firebase/firestore';
import posthog from 'posthog-js';

// Extracted verbatim from the original inline logic in components/dashboard/Chat.js
// so both the classic and dashboard-shell presentations run the exact same real
// tmi.js/Firestore wiring rather than duplicating it. No behavior changes.
export function useChatData({ targetUid, userRole, enabled = true }) {
    const { user } = useAuth();
    const effectiveUid = useMemo(() => (enabled ? (targetUid || user?.uid) : null), [enabled, targetUid, user?.uid]);
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
    const promotingRef = useRef(false);

    const clientRef = useRef(null);
    const connectingRef = useRef(false);
    const lastFetchedIdRef = useRef(null);
    const emotesRef = useRef({ sevenTV: [], bttv: [], ffz: [] });
    const channelRef = useRef(null);
    // The tmi.js client is (re)created only when channelName/reconnectNonce
    // change, not on every effectiveUid/canManageQueue change - so the
    // CLEARMSG/timeout handlers registered on it read these through refs
    // rather than closing over stale values from whenever connect() ran.
    const effectiveUidRef = useRef(effectiveUid);
    const canManageQueueRef = useRef(canManageQueue);
    const [reconnectNonce, setReconnectNonce] = useState(0);
    const reconnect = () => setReconnectNonce(n => n + 1);

    // Cache to prevent redundant avatar fetches in a single session
    const avatarCache = useRef({});

    useEffect(() => {
        emotesRef.current = thirdPartyEmotes;
    }, [thirdPartyEmotes]);

    useEffect(() => {
        effectiveUidRef.current = effectiveUid;
        canManageQueueRef.current = canManageQueue;
    }, [effectiveUid, canManageQueue]);

    // Deletes every stored copy of one Twitch message (history, still-queued,
    // and the currently-live overlay message) after Twitch reports it deleted
    // via CLEARMSG. Deliberately per-message rather than reacting to a bare
    // CLEARCHAT (full chat clear) too - honoring "you deleted it on Twitch, so
    // it's gone here" shouldn't also mean a mod running /clear wipes a
    // streamer's entire re-air history as a side effect.
    const deleteMessagesByTwitchId = async (uid, twitchMessageId) => {
        if (!uid || !twitchMessageId) return;
        try {
            const batch = writeBatch(db);
            for (const col of ['history', 'message_queue']) {
                const snap = await getDocs(query(collection(db, 'users', uid, col), where('twitchMessageId', '==', twitchMessageId)));
                snap.forEach(d => batch.delete(d.ref));
            }
            const activeRef = doc(db, 'users', uid, 'active_message', 'current');
            const activeSnap = await getDoc(activeRef);
            if (activeSnap.exists() && activeSnap.data().twitchMessageId === twitchMessageId) {
                batch.delete(activeRef);
            }
            await batch.commit();
        } catch (e) { console.error('Error deleting message after Twitch CLEARMSG:', e); }
    };

    // Same idea for a user timeout/ban (CLEARCHAT with a target user) -
    // removes everything stored under that Twitch login, matching Twitch's
    // own "this person's messages are gone" behavior.
    const deleteMessagesByLogin = async (uid, login) => {
        if (!uid || !login) return;
        try {
            const batch = writeBatch(db);
            for (const col of ['history', 'message_queue', 'suggestions']) {
                const snap = await getDocs(query(collection(db, 'users', uid, col), where('login', '==', login)));
                snap.forEach(d => batch.delete(d.ref));
            }
            const activeRef = doc(db, 'users', uid, 'active_message', 'current');
            const activeSnap = await getDoc(activeRef);
            if (activeSnap.exists() && activeSnap.data().login === login) {
                batch.delete(activeRef);
            }
            await batch.commit();
        } catch (e) { console.error('Error deleting messages after Twitch timeout/ban:', e); }
    };

    const displayMessages = useMemo(() => {
        return messages.map(msg => ({
            ...msg,
            fragments: parseTwitchMessage(msg.message, msg.rawEmotes, thirdPartyEmotes)
        }));
    }, [messages, thirdPartyEmotes]);

    useEffect(() => {
        if (!user || !effectiveUid) return;
        let active = true;
        const fetchUserData = async (retries = 3) => {
            try {
                const userDoc = await getDoc(doc(db, 'users', effectiveUid));
                if (!active || !userDoc.exists()) return;
                const data = userDoc.data();
                const name = (data.twitchUsername || data.displayName || (effectiveUid === user.uid ? user.displayName : null))?.toLowerCase().trim();
                if (name && name !== channelRef.current) {
                    channelRef.current = name;
                    setChannelName(name);
                }
                const bId = data.twitchId || (effectiveUid === user.uid ? user.providerData[0]?.uid : null);
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
                if (targetMsgId) deleteMessagesByTwitchId(effectiveUidRef.current, targetMsgId);
            });
            client.on('timeout', (channel, username) => {
                if (!canManageQueueRef.current) return;
                deleteMessagesByLogin(effectiveUidRef.current, username);
            });
            client.on('ban', (channel, username) => {
                if (!canManageQueueRef.current) return;
                deleteMessagesByLogin(effectiveUidRef.current, username);
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
    }, [user, channelName, reconnectNonce]);

    useEffect(() => {
        if (!effectiveUid || userRole === 'viewer') return;

        // Listen for suggestions (Broadcaster/Mods only)
        const suggestionsRef = collection(db, 'users', effectiveUid, 'suggestions');
        const unsub = onSnapshot(suggestionsRef, (snapshot) => {
            const list = [];
            snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
            setSuggestions(list.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0)));
        });

        return () => unsub();
    }, [effectiveUid, userRole]);

    // Listen for active message to show Hide button
    useEffect(() => {
        if (!effectiveUid) return;
        const msgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
        const unsub = onSnapshot(msgRef, (doc) => {
            setActiveMessage(doc.exists() ? doc.data() : null);
        });
        return () => unsub();
    }, [effectiveUid]);

    // Listen for the pending "show next" queue, oldest first.
    useEffect(() => {
        if (!effectiveUid || !canManageQueue) return;
        const q = query(collection(db, 'users', effectiveUid, 'message_queue'), orderBy('queuedAt', 'asc'));
        const unsub = onSnapshot(q, (snapshot) => {
            setQueuedMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [effectiveUid, canManageQueue]);

    // Needed to know when a timed (non-permanent) active message will
    // naturally finish its on-screen time, so this client can expire it and
    // advance the queue - see the two effects below.
    useEffect(() => {
        if (!effectiveUid) return;
        const ref = doc(db, 'users', effectiveUid, 'settings', 'config');
        const unsub = onSnapshot(ref, (snap) => {
            if (snap.exists() && typeof snap.data().displayDuration === 'number') {
                setDisplayDuration(snap.data().displayDuration);
            }
        });
        return () => unsub();
    }, [effectiveUid]);

    // Expire the active message once its on-screen time is up. The overlay
    // has no write access (it's intentionally unauthenticated - see
    // firestore.rules), so it can only ever hide a message locally/visually;
    // this dashboard-side client is the only place that can actually clear
    // active_message/current in Firestore, which is what lets the queue below
    // know it's time to advance.
    useEffect(() => {
        if (!effectiveUid || !activeMessage || !canManageQueue) return;
        const duration = activeMessage.duration !== undefined ? activeMessage.duration : displayDuration;
        if (!(duration > 0)) return; // -1/undefined duration means "permanent" - stays until replaced or hidden
        const activeMsgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
        const expiringId = activeMessage.activeId;
        const timer = setTimeout(async () => {
            try {
                // With two dashboard clients open, another client's replacement
                // could land in the window between this timer firing and the
                // delete committing - re-check activeId inside a transaction
                // instead of deleting unconditionally, so a stale timer from the
                // OLD message can never delete a message that replaced it.
                await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(activeMsgRef);
                    if (snap.exists() && snap.data().activeId === expiringId) {
                        transaction.delete(activeMsgRef);
                    }
                });
            } catch (e) { console.error('Error expiring active message:', e); }
        }, duration * 1000 + 500);
        return () => clearTimeout(timer);
    }, [effectiveUid, activeMessage, displayDuration, canManageQueue]);

    // Promote the next queued message once the screen is clear.
    useEffect(() => {
        if (!effectiveUid || activeMessage || queuedMessages.length === 0 || promotingRef.current || !canManageQueue) return;
        promotingRef.current = true;
        const { id: queueDocId, queuedAt, ...rest } = queuedMessages[0];
        const payload = { ...rest, activeId: crypto.randomUUID() };
        (async () => {
            try {
                const activeMsgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
                const queueRef = doc(db, 'users', effectiveUid, 'message_queue', queueDocId);
                // Pre-generated ref (rather than addDoc) so this write can join
                // the same transaction as the others below.
                const historyRef = doc(collection(db, 'users', effectiveUid, 'history'));

                // With two dashboard clients open, both can see the same empty
                // active slot and the same queued item at once and each start
                // promoting it - re-check both inside a transaction instead of
                // the separate setDoc/addDoc/deleteDoc calls this used to be, so
                // only one client's promotion actually commits.
                const promoted = await runTransaction(db, async (transaction) => {
                    const activeSnap = await transaction.get(activeMsgRef);
                    const queueSnap = await transaction.get(queueRef);
                    const slotTaken = activeSnap.exists() && Object.keys(activeSnap.data()).length > 0;
                    if (slotTaken || !queueSnap.exists()) return false;
                    transaction.set(activeMsgRef, payload);
                    transaction.set(historyRef, payload);
                    transaction.delete(queueRef);
                    return true;
                });

                if (promoted) posthog.capture('message_shown', { source: 'queue' });
            } catch (e) {
                console.error('Error promoting queued message:', e);
            } finally {
                promotingRef.current = false;
            }
        })();
    }, [effectiveUid, activeMessage, queuedMessages, canManageQueue]);

    const hideOverlay = async () => {
        if (!effectiveUid) return;
        try {
            await deleteDoc(doc(db, 'users', effectiveUid, 'active_message', 'current'));
        } catch (e) { console.error("Error hiding:", e); }
    };

    const sendToScreen = async (msg, permanent = false) => {
        if (!user || userRole === 'denied') return;

        const isViewer = userRole === 'viewer';
        const payload = {
            username: msg.username,
            login: msg.login,
            avatarUrl: msg.avatarUrl,
            color: msg.color,
            fragments: msg.fragments,
            timestamp: serverTimestamp(),
            suggestedBy: user.uid,
            suggestedByName: user.displayName,
            // Twitch's own message id (tags.id from the live chat event, see
            // above) - kept so a later CLEARMSG for this message can find and
            // delete every stored copy of it. Absent for anything that didn't
            // originate from a live tmi.js message (e.g. the Settings tab's
            // synthetic test message).
            twitchMessageId: msg.id || null,
        };

        if (permanent) {
            payload.duration = -1;
        }

        try {
            if (isViewer) {
                const suggestionsRef = collection(db, 'users', effectiveUid, 'suggestions');
                if (payload.duration) delete payload.duration;
                await addDoc(suggestionsRef, payload);
                console.log('Suggestion Sent ✅');
            } else {
                // MODS/BROADCASTER: Send directly to screen
                const activeMsgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
                const historyRef = collection(db, 'users', effectiveUid, 'history');

                const finalPayload = { ...payload, activeId: crypto.randomUUID() };
                if (!permanent) delete finalPayload.duration;

                await setDoc(activeMsgRef, finalPayload);
                await addDoc(historyRef, finalPayload);
                posthog.capture('message_sent', { permanent });
                console.log('Sent to Screen ✅');
            }
        } catch (e) { console.error(e); }
    };

    // Mods/broadcaster only (viewers already have "suggest" for the
    // not-direct-to-screen case). Adds to message_queue instead of writing
    // active_message/current directly - the queue-advance effect above shows
    // it immediately if nothing's currently on screen, or once the current
    // message's time is up.
    const queueMessage = async (msg, permanent = false) => {
        if (!user || !canManageQueue) return;

        const payload = {
            username: msg.username,
            login: msg.login,
            avatarUrl: msg.avatarUrl,
            color: msg.color,
            fragments: msg.fragments,
            timestamp: serverTimestamp(),
            queuedAt: serverTimestamp(),
            suggestedBy: user.uid,
            suggestedByName: user.displayName,
            twitchMessageId: msg.id || null,
        };
        if (permanent) payload.duration = -1;

        try {
            await addDoc(collection(db, 'users', effectiveUid, 'message_queue'), payload);
            posthog.capture('message_queued', { permanent });
            console.log('Queued ✅');
        } catch (e) { console.error(e); }
    };

    const removeFromQueue = async (queueId) => {
        if (!effectiveUid || !canManageQueue) return;
        try {
            await deleteDoc(doc(db, 'users', effectiveUid, 'message_queue', queueId));
        } catch (e) { console.error('Error removing from queue:', e); }
    };

    const approveSuggestion = async (sug) => {
        try {
            const payload = { ...sug, timestamp: serverTimestamp(), activeId: crypto.randomUUID() };
            delete payload.id; // Remove the suggestion doc ID from payload

            const activeMsgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
            const historyRef = collection(db, 'users', effectiveUid, 'history');
            const sugRef = doc(db, 'users', effectiveUid, 'suggestions', sug.id);

            await setDoc(activeMsgRef, payload);
            await addDoc(historyRef, payload);
            await deleteDoc(sugRef);
        } catch (e) { console.error(e); }
    };

    const denySuggestion = async (sugId) => {
        try {
            const sugRef = doc(db, 'users', effectiveUid, 'suggestions', sugId);
            await deleteDoc(sugRef);
        } catch (e) { console.error(e); }
    };

    // Local-only: the live chat log is ephemeral React state, not persisted
    // anywhere (a page reload already clears it), so clearing it needs no
    // Firestore write.
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
