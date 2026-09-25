'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildSettingsUpdate, extractAppearanceFromFlat } from '@/lib/settingsMapping';

// Public, unauthenticated - identical to what the real karafun.com/{partyId}
// remote client itself calls, confirmed by driving that page directly and
// reading its network traffic (see #27). No backend proxy needed - stays
// direct per docs/karafun-relay-design.md §0/§6, unlike the queue/status/
// command paths below.
export async function searchKaraFunSongs(partyId, query) {
    if (!partyId || !query) return [];
    const res = await fetch(`https://www.karafun.com/${partyId}/?type=search&q=${encodeURIComponent(query)}&types=karaoke`);
    if (!res.ok) throw new Error('KaraFun search failed');
    return res.json();
}

// This used to open its own socket.io connection straight to KaraFun (see
// git history) - closed issue #29's real gap: canControl was a client-side-
// only guard, so a determined user could call any of the emit functions
// below on someone else's turn/queue entry with nothing to stop them. Now
// this only ever reads users/{targetUid}/karafun_state (mirrored by
// relay/, the one process that still holds a real KaraFun socket) and sends
// commands through /api/karafun/[userId]/command, which re-derives role/
// turn/ownership server-side instead of trusting this hook's caller - see
// docs/karafun-relay-design.md §3/§7.
export function useKaraFunData({ targetUid, userSettings }) {
    const [queueData, setQueueData] = useState(null);
    // Mirrors the relay's own live KaraFun connection state (see
    // karafunConnection.js's `connected` field) - not this hook's own
    // connection, since it no longer has one.
    const [connected, setConnected] = useState(false);
    const [tempPartyId, setTempPartyId] = useState(userSettings?.karafunPartyId || '');
    const [isSavingId, setIsSavingId] = useState(false);

    // Stays in the public settings row (readable by the whole channel), not
    // private_config - an earlier version of this moved it to private_config
    // on the reasoning that once the relay is the only thing dialing KaraFun
    // directly, nobody client-side needs it anymore. That broke real usage: a
    // mod/singer/viewer session (dashboard?host={broadcasterUid}) has no
    // private_config access to someone else's channel (owner-only by rule,
    // and rightly so - it also holds apiToken), so every non-owner role lost
    // partyId entirely, and with it KaraokePane's search/self-add
    // (searchKaraFunSongs needs it) and the "no party ID" gate. The premise
    // didn't hold either: a KaraFun party ID is public-by-design (KaraFun's
    // own UI shows it so people can join) - hiding it inside this app never
    // closed a real gap, since anyone with the ID can already dial KaraFun
    // directly regardless of what this app does. The actual security win
    // (issue #29) was routing every mutation through the authenticated
    // command queue, not obscuring the ID - found by testing with a real
    // second (singer-role) account.
    const partyId = userSettings?.karafunPartyId;

    useEffect(() => {
        setTempPartyId(userSettings?.karafunPartyId || '');
    }, [userSettings?.karafunPartyId]);

    const handleSavePartyId = async () => {
        if (!targetUid || !tempPartyId || !supabase) return;
        setIsSavingId(true);
        try {
            // upsert, not update: a broadcaster who has never set a party ID
            // yet may have no settings row at all.
            await supabase.from('settings').upsert({ user_id: targetUid, karafun_party_id: tempPartyId }, { onConflict: 'user_id' });
        } catch (err) {
            console.error("Error saving Party ID:", err);
        } finally {
            setIsSavingId(false);
        }
    };

    const handleToggleSetting = async (field, value) => {
        if (!targetUid || !supabase) return;
        try {
            const update = buildSettingsUpdate(field, value, extractAppearanceFromFlat(userSettings));
            await supabase.from('settings').upsert({ user_id: targetUid, ...update }, { onConflict: 'user_id' });
        } catch (err) {
            console.error(`Error saving ${field}:`, err);
        }
    };

    const handleShowNowPlaying = async () => {
        if (!targetUid || !supabase) return;
        try {
            await supabase.from('overlay_triggers').upsert({ user_id: targetUid, now_playing_triggered_at: new Date().toISOString() }, { onConflict: 'user_id' });
        } catch (err) {
            console.error('Error triggering Now Playing:', err);
        }
    };

    const handleHideNowPlaying = async () => {
        if (!targetUid || !supabase) return;
        try {
            await supabase.from('overlay_triggers').delete().eq('user_id', targetUid);
        } catch (err) {
            console.error('Error hiding Now Playing:', err);
        }
    };

    useEffect(() => {
        if (!targetUid || !userSettings?.karafunEnabled || !supabase) {
            setQueueData(null);
            setConnected(false);
            return;
        }

        const applyState = (row) => {
            if (row) {
                setQueueData({ upcoming: row.upcoming || [], currentSong: row.current_song || null, playState: row.play_state, activeSingerUid: row.active_singer_id || null });
                setConnected(!!row.connected);
            } else {
                setQueueData(null);
                setConnected(false);
            }
        };

        supabase.from('karafun_state').select('*').eq('user_id', targetUid).maybeSingle()
            .then(({ data }) => applyState(data));

        const channel = supabase
            .channel(`karafun-data-state-${targetUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'karafun_state', filter: `user_id=eq.${targetUid}` }, (payload) => {
                applyState(payload.eventType === 'DELETE' ? null : payload.new);
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [targetUid, userSettings?.karafunEnabled]);

    // Every one of these used to be a raw, unauthenticated emit straight to
    // KaraFun's real socket (see git history / issue #29's own description
    // of that gap). Now they all funnel through one authenticated POST - the
    // route, not this hook, decides whether the caller's role/turn/ownership
    // actually allows the requested action (see
    // src/lib/karafunCommands.js §3.3). A command that's rejected server-side
    // just logs a warning here; the UI's own role-based control hiding
    // (isMyTurn etc., still computed client-side for UX) is what normally
    // keeps a disallowed call from ever being made in the first place.
    //
    // NOTE: /api/karafun/[userId]/command itself is still Firebase-backed
    // (migration plan Phase 5, not yet ported) - this Supabase access token
    // will be rejected server-side until that route is ported too.
    const sendCommand = async (action, params = {}) => {
        if (!targetUid || !supabase) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const res = await fetch(`/api/karafun/${targetUid}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                body: JSON.stringify({ action, params }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                console.warn(`KaraFun command "${action}" rejected:`, body?.error || res.status);
            }
        } catch (err) {
            console.error(`KaraFun command "${action}" failed:`, err);
        }
    };

    const addToQueue = (songId, singer, pos = 99999) => sendCommand('addToQueue', { songId, pos, singer });
    const moveInQueue = (queueId, from, to) => sendCommand('moveInQueue', { queueId, from, to });
    const removeFromQueue = (queueId) => sendCommand('removeFromQueue', { queueId });
    // pitch/tempo are relative steps (±1 / ±5 per press), not absolute values -
    // see the wire-protocol table in docs/karafun-relay-design.md §3.1.
    const adjustPitch = (delta) => sendCommand('adjustPitch', { delta });
    const adjustTempo = (delta) => sendCommand('adjustTempo', { delta });
    const setVolume = (value) => sendCommand('setVolume', { value });
    const setBackingVocalsVolume = (value) => sendCommand('setBackingVocalsVolume', { value });
    const setLeadVocalVolume = (filename, value) => sendCommand('setLeadVocalVolume', { filename, value });
    const playSong = () => sendCommand('playSong');
    const skipSong = () => sendCommand('skipSong');

    return {
        queueData, connected, tempPartyId, setTempPartyId, isSavingId, partyId,
        handleSavePartyId, handleToggleSetting, handleShowNowPlaying, handleHideNowPlaying,
        addToQueue, moveInQueue, removeFromQueue, adjustPitch, adjustTempo,
        setVolume, setBackingVocalsVolume, setLeadVocalVolume, playSong, skipSong,
    };
}
