'use client';

import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore';

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
// this only ever reads users/{targetUid}/karafun_state/live (mirrored by
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

    // Stays in settings/config (public within the app), not private/config -
    // an earlier version of this moved it to private/config on the reasoning
    // that once the relay is the only thing dialing KaraFun directly, nobody
    // client-side needs it anymore. That broke real usage: a mod/singer/
    // viewer session (dashboard?host={broadcasterUid}) has no private/config
    // access to someone else's channel (owner-only by rule, and rightly so -
    // it also holds apiToken), so every non-owner role lost partyId entirely,
    // and with it KaraokePane's search/self-add (searchKaraFunSongs needs it)
    // and the "no party ID" gate. The premise didn't hold either: a KaraFun
    // party ID is public-by-design (KaraFun's own UI shows it so people can
    // join) - hiding it inside this app never closed a real gap, since
    // anyone with the ID can already dial KaraFun directly regardless of
    // what this app does. The actual security win (issue #29) was routing
    // every mutation through the authenticated command queue, not obscuring
    // the ID - found by testing with a real second (singer-role) account.
    const partyId = userSettings?.karafunPartyId;

    useEffect(() => {
        setTempPartyId(userSettings?.karafunPartyId || '');
    }, [userSettings?.karafunPartyId]);

    const handleSavePartyId = async () => {
        if (!targetUid || !tempPartyId) return;
        setIsSavingId(true);
        try {
            const configRef = doc(db, 'users', targetUid, 'settings', 'config');
            await setDoc(configRef, { karafunPartyId: tempPartyId }, { merge: true });
        } catch (err) {
            console.error("Error saving Party ID:", err);
        } finally {
            setIsSavingId(false);
        }
    };

    const handleToggleSetting = async (field, value) => {
        if (!targetUid) return;
        try {
            const configRef = doc(db, 'users', targetUid, 'settings', 'config');
            await setDoc(configRef, { [field]: value }, { merge: true });
        } catch (err) {
            console.error(`Error saving ${field}:`, err);
        }
    };

    const handleShowNowPlaying = async () => {
        if (!targetUid) return;
        try {
            const triggerRef = doc(db, 'users', targetUid, 'overlay_triggers', 'now_playing');
            await setDoc(triggerRef, { triggeredAt: new Date().toISOString() });
        } catch (err) {
            console.error('Error triggering Now Playing:', err);
        }
    };

    const handleHideNowPlaying = async () => {
        if (!targetUid) return;
        try {
            const triggerRef = doc(db, 'users', targetUid, 'overlay_triggers', 'now_playing');
            await deleteDoc(triggerRef);
        } catch (err) {
            console.error('Error hiding Now Playing:', err);
        }
    };

    useEffect(() => {
        if (!targetUid || !userSettings?.karafunEnabled) {
            setQueueData(null);
            setConnected(false);
            return;
        }

        const stateRef = doc(db, 'users', targetUid, 'karafun_state', 'live');
        const unsubscribe = onSnapshot(stateRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setQueueData({ upcoming: data.upcoming || [], currentSong: data.currentSong || null, playState: data.playState, activeSingerUid: data.activeSingerUid || null });
                setConnected(!!data.connected);
            } else {
                setQueueData(null);
                setConnected(false);
            }
        });

        return () => unsubscribe();
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
    const sendCommand = async (action, params = {}) => {
        if (!targetUid || !auth.currentUser) return;
        try {
            const idToken = await auth.currentUser.getIdToken();
            const res = await fetch(`/api/karafun/${targetUid}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
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
