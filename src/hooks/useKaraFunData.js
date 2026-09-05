'use client';

import { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import io from 'socket.io-client';
import posthog from 'posthog-js';

// Public, unauthenticated - identical to what the real karafun.com/{partyId}
// remote client itself calls, confirmed by driving that page directly and
// reading its network traffic (see #27). No backend proxy needed.
export async function searchKaraFunSongs(partyId, query) {
    if (!partyId || !query) return [];
    const res = await fetch(`https://www.karafun.com/${partyId}/?type=search&q=${encodeURIComponent(query)}&types=karaoke`);
    if (!res.ok) throw new Error('KaraFun search failed');
    return res.json();
}

// Extracted verbatim from the original inline logic in components/dashboard/KaraFun.js.
export function useKaraFunData({ targetUid, userSettings }) {
    const [queueData, setQueueData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [tempPartyId, setTempPartyId] = useState(userSettings?.karafunPartyId || '');
    const [isSavingId, setIsSavingId] = useState(false);
    const [reconnectKey, setReconnectKey] = useState(0);
    // Emitters below (queueAdd/queueMove/... - see #27) read from this ref
    // rather than closing over the effect's local `socket` const, since they're
    // called from outside that effect and need whichever connection is current.
    const socketRef = useRef(null);

    const handleReconnect = () => {
        setQueueData(null);
        setLastUpdated(null);
        setError(null);
        setReconnectKey(k => k + 1);
    };

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
            setError("Failed to save Party ID. Check permissions.");
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
        if (!partyId || !userSettings?.karafunEnabled) {
            // loading otherwise stays stuck at its initial true forever here -
            // nothing else ever sets it false, since no socket connection is
            // even attempted without a Party ID, so the header action stayed
            // disabled and permanently labeled "Connecting..." instead of
            // reflecting the real "no Party ID set" state.
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        // Unique login per session — avoids duplicate-name rejection on reconnects
        const suffix = Math.floor(1000 + Math.random() * 9000);
        const loginName = `StreamCastPro${suffix}`;
        // 'connect' only confirms the transport-level socket connected, not that
        // this is actually a valid KaraFun party (serverUnreacheable can still
        // follow it) - captured once, on the first real payload proving the
        // authenticated connection actually works.
        let hasCapturedConnected = false;
        const captureConnectedOnce = () => {
            if (hasCapturedConnected) return;
            hasCapturedConnected = true;
            posthog.capture('karafun_connected');
        };

        // KaraFun uses Socket.IO v2 at https://www.karafun.com
        // The party is identified by the query parameter: remote=kf[partyId]
        const socket = io('https://www.karafun.com', {
            query: { remote: `kf${partyId}` },
            transports: ['polling', 'websocket'],
            forceNew: true,
            reconnection: true,
            reconnectionDelay: 3000,
            reconnectionAttempts: Infinity,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log('KaraFun Sync: Connected to party', partyId);
            setError(null);

            // KaraFun requires an authenticate event before it pushes any data
            console.log('KaraFun Sync: Authenticating as', loginName);
            socket.emit('authenticate', {
                login: loginName,
                channel: partyId,
                role: 'participant',
                app: 'karafun',
                socket_id: null,
            }, null);
        });

        socket.on('connect_error', (err) => {
            console.error('KaraFun Sync: Connection error', err);
            setError('Connection error. Retrying...');
        });

        socket.on('serverUnreacheable', () => {
            console.error('KaraFun Sync: Party unreachable', partyId);
            setError('Party unreachable. Make sure the KaraFun app is open and connected to this party. You can try restarting the Party in the Settings (Turn Remote Off and On again) or restarting the KaraFun App.');
            setLoading(false);
        });

        socket.on('disconnect', (reason) => {
            console.log('KaraFun Sync: Disconnected -', reason);
        });

        // Real-time queue updates
        // Real queue items have top-level: { title, artist, singer, songId, queueId, status }
        socket.on('queue', (items) => {
            console.log('KaraFun Sync: Queue received', items);
            captureConnectedOnce();
            const transformed = (items || []).map(item => ({
                title: item.title || 'Unknown',
                artist: item.artist || '',
                singer: item.singer || '',
                // Needed to target queueMove/queueRemove at a specific entry (see
                // #27) - not used by the read-only display, only by KaraokePane's
                // mod reorder panel.
                queueId: item.queueId,
            }));
            setQueueData(prev => ({
                ...prev,
                upcoming: transformed,
                // The authoritative "is anything left to play at all" signal -
                // status's own 'idle' is ambiguous (also means "paused, still
                // loaded") and can arrive before OR after this same event on a
                // real party (verified live: Skip fires status:'idle' first,
                // queue:[] a moment later), so checking prev.upcoming inside
                // the status handler below races and can miss this. Checking
                // the queue's own fresh length here instead doesn't.
                currentSong: transformed.length === 0 ? null : (prev?.currentSong ?? null),
                timestamp: Date.now(),
            }));
            setLastUpdated(new Date());
            setLoading(false);
            setError(null);
        });

        // Real-time playback status
        socket.on('status', (status) => {
            console.log('KaraFun Sync: Status received (full):', JSON.stringify(status));
            captureConnectedOnce();
            setLoading(false);
            setError(null);
            setLastUpdated(new Date());

            // Resolve current song from whichever field KaraFun uses when playing
            const cur = status?.songPlaying || status?.current || null;
            if (cur) {
                setQueueData(prev => ({
                    ...prev,
                    currentSong: {
                        title: cur.title || cur.song?.title || 'Unknown',
                        artist: cur.artist || cur.song?.artist || '',
                        singer: cur.singer || cur.singerName || cur.options?.singer || '',
                    },
                    playState: status.state,
                }));
            } else {
                setQueueData(prev => {
                    // 'idle' is ambiguous by itself - KaraFun reports it both when a
                    // song is loaded but paused (keep showing it - see the Play/Pause
                    // toggle) AND when the queue has fully emptied with nothing loaded
                    // at all (the last song finished, no 'infoscreen'/'stop' in
                    // between). The 'queue' handler above is the authoritative fix for
                    // that (its own fresh queue length, not this stale closure) since a
                    // real party can send this 'status' event BEFORE the matching
                    // 'queue' event (verified live via Skip) - this check is just a
                    // secondary catch for whichever arrives first.
                    const queueEmpty = (prev?.upcoming?.length ?? 0) === 0;
                    const nothingLoaded = status?.state === 'infoscreen' || status?.state === 'stop' || (status?.state === 'idle' && queueEmpty);
                    return {
                        ...prev,
                        currentSong: nothingLoaded ? null : prev?.currentSong,
                        playState: status?.state,
                    };
                });
            }
        });

        return () => {
            console.log('KaraFun Sync: Cleaning up socket');
            socket.disconnect();
            if (socketRef.current === socket) socketRef.current = null;
        };
    }, [partyId, userSettings?.karafunEnabled, reconnectKey]);

    // Queue/playback actions (see #27) - all verified live against KaraFun's
    // real protocol by driving the actual remote client and capturing its
    // socket frames, not assumed from any documentation. Every emit is a
    // silent no-op if there's no live connection yet, matching how KaraFun's
    // own remote client behaves when a control is used before it's ready.
    const emit = (event, payload) => { if (socketRef.current) socketRef.current.emit(event, payload); };
    const addToQueue = (songId, singer, pos = 99999) => emit('queueAdd', { songId, pos, singer });
    const moveInQueue = (queueId, from, to) => emit('queueMove', { queueId, from, to });
    const removeFromQueue = (queueId) => emit('queueRemove', queueId);
    // pitch/tempo are relative steps (±1 / ±5 per press), not absolute values -
    // confirmed live: clicking + twice moved the displayed value from 0 to +2,
    // sending the same delta both times.
    const adjustPitch = (delta) => emit('pitch', delta);
    const adjustTempo = (delta) => emit('tempo', delta);
    const setVolume = (value) => emit('volume', value);
    const setBackingVocalsVolume = (value) => emit('volumeBv', value);
    // filename distinguishes which lead-vocal stem this is - solo songs have
    // one ("1"), duets have two ("1" and "2"); render one slider per stem the
    // song actually reports, not a fixed count.
    const setLeadVocalVolume = (filename, value) => emit('volumeLd', { filename, volume: value });
    const playSong = () => emit('play', null);
    // Also the only way to clear the currently active/playing song - it has no
    // drag handle in KaraFun's own remote client and can't be targeted by
    // queueMove/queueRemove, confirmed live.
    const skipSong = () => emit('next', null);

    return {
        queueData, loading, error, lastUpdated, tempPartyId, setTempPartyId, isSavingId, partyId,
        handleReconnect, handleSavePartyId, handleToggleSetting, handleShowNowPlaying, handleHideNowPlaying,
        addToQueue, moveInQueue, removeFromQueue, adjustPitch, adjustTempo,
        setVolume, setBackingVocalsVolume, setLeadVocalVolume, playSong, skipSong,
    };
}
