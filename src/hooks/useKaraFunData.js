'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import io from 'socket.io-client';

// Extracted verbatim from the original inline logic in components/dashboard/KaraFun.js.
export function useKaraFunData({ targetUid, userSettings }) {
    const [queueData, setQueueData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [tempPartyId, setTempPartyId] = useState(userSettings?.karafunPartyId || '');
    const [isSavingId, setIsSavingId] = useState(false);
    const [reconnectKey, setReconnectKey] = useState(0);

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
            const transformed = (items || []).map(item => ({
                title: item.title || 'Unknown',
                artist: item.artist || '',
                singer: item.singer || '',
            }));
            setQueueData(prev => ({
                ...prev,
                upcoming: transformed,
                timestamp: Date.now(),
            }));
            setLastUpdated(new Date());
            setLoading(false);
            setError(null);
        });

        // Real-time playback status
        socket.on('status', (status) => {
            console.log('KaraFun Sync: Status received (full):', JSON.stringify(status));
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
                setQueueData(prev => ({
                    ...prev,
                    // Clear current song if state is infoscreen (nothing playing)
                    currentSong: (status?.state === 'infoscreen' || status?.state === 'stop') ? null : prev?.currentSong,
                    playState: status?.state,
                }));
            }
        });

        return () => {
            console.log('KaraFun Sync: Cleaning up socket');
            socket.disconnect();
        };
    }, [partyId, userSettings?.karafunEnabled, reconnectKey]);

    return {
        queueData, loading, error, lastUpdated, tempPartyId, setTempPartyId, isSavingId, partyId,
        handleReconnect, handleSavePartyId, handleToggleSetting, handleShowNowPlaying, handleHideNowPlaying,
    };
}
