'use client';

import React, { useEffect, useState } from 'react';
import { Music, RefreshCw, AlertCircle, Play, ListMusic, User, Save } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import io from 'socket.io-client';

export default function KaraFun({ targetUid, userSettings }) {
    const [queueData, setQueueData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [tempPartyId, setTempPartyId] = useState(userSettings?.karafunPartyId || '');
    const [isSavingId, setIsSavingId] = useState(false);

    const partyId = userSettings?.karafunPartyId;

    useEffect(() => {
        setTempPartyId(userSettings?.karafunPartyId || '');
    }, [userSettings?.karafunPartyId]);

    const handleSavePartyId = async () => {
        if (!targetUid || !tempPartyId) return;
        setIsSavingId(true);
        try {
            const configRef = doc(db, 'users', targetUid, 'settings', 'config');
            await updateDoc(configRef, { karafunPartyId: tempPartyId });
        } catch (err) {
            console.error("Error saving Party ID:", err);
            setError("Failed to save Party ID. Check permissions.");
        } finally {
            setIsSavingId(false);
        }
    };

    useEffect(() => {
        if (!partyId || !userSettings?.karafunEnabled) return;

        setLoading(true);
        setError(null);

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
            socket.emit('authenticate', {
                login: 'StreamCastPro',
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
            console.log('KaraFun Sync: Status received', status);
            setLoading(false);
            setError(null);
            setLastUpdated(new Date());
            // status.state can be 'playing', 'paused', 'infoscreen', etc.
            // The current song may be available on the status object
            if (status && status.current) {
                setQueueData(prev => ({
                    ...prev,
                    currentSong: {
                        title: status.current.title || status.current.song?.title || 'Unknown',
                        artist: status.current.artist || status.current.song?.artist || '',
                        singer: status.current.singerName || status.current.options?.singer || '',
                    },
                    playState: status.state,
                }));
            } else {
                // status object itself is the playback status (pitch, volume, state etc.)
                setQueueData(prev => ({
                    ...prev,
                    playState: status?.state,
                }));
            }
        });

        return () => {
            console.log('KaraFun Sync: Cleaning up socket');
            socket.disconnect();
        };
    }, [partyId, userSettings?.karafunEnabled]);

    if (!userSettings?.karafunEnabled) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-zinc-500">
                <Music size={48} className="mb-4 opacity-20" />
                <p>KaraFun integration is disabled.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl">
            {/* ID CONFIGURATION SECTION */}
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-4">
                <div className="flex items-center gap-3 mb-2">
                    <div className="bg-purple-500/20 p-2 rounded-lg">
                        <Music className="text-purple-400" size={18} />
                    </div>
                    <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Party Configuration</h4>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <input
                        type="text"
                        placeholder="Enter KaraFun Party ID (e.g. 727383)"
                        value={tempPartyId}
                        onChange={(e) => setTempPartyId(e.target.value)}
                        className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 outline-none focus:ring-2 focus:ring-purple-600 transition-all font-medium"
                    />
                    <button
                        onClick={handleSavePartyId}
                        disabled={isSavingId || tempPartyId === partyId}
                        className="px-6 py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:hover:bg-purple-600 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                    >
                        <Save size={18} />
                        {isSavingId ? 'Saving...' : 'Save ID'}
                    </button>
                </div>
                {!partyId && (
                    <p className="text-xs text-zinc-500 italic">Enter your Party ID to start tracking the queue.</p>
                )}
            </div>

            {/* Header / Info (Only shown if ID is set) */}
            {partyId && (
                <div className="flex justify-between items-center bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-500/20 p-2 rounded-lg">
                            <Music className="text-indigo-400" size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-zinc-100">KaraFun Party: {partyId}</h3>
                            <p className="text-xs text-zinc-500">
                                {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Connecting...'}
                            </p>
                        </div>
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${error ? 'bg-red-500' : lastUpdated ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} title={error ? 'Disconnected' : lastUpdated ? 'Connected' : 'Connecting...'} />
                </div>
            )}

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-200 text-sm">
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            {loading && !queueData && partyId && (
                <div className="flex justify-center p-12">
                    <RefreshCw className="animate-spin text-indigo-500" size={32} />
                </div>
            )}

            {queueData && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Now Playing */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                            <Play size={12} className="text-green-500" /> Now Playing
                        </h4>

                        {queueData.currentSong ? (
                            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/20 transition-colors" />
                                <div className="relative">
                                    <h5 className="text-2xl font-black text-white mb-1">{queueData.currentSong.title}</h5>
                                    <p className="text-indigo-400 font-bold mb-4">{queueData.currentSong.artist}</p>

                                    {queueData.currentSong.singer && (
                                        <div className="flex items-center gap-2 bg-zinc-800/50 w-max px-3 py-1.5 rounded-full border border-white/5">
                                            <User size={14} className="text-zinc-400" />
                                            <span className="text-sm font-medium text-zinc-300">Singer: {queueData.currentSong.singer}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="bg-zinc-900/30 border border-zinc-800 border-dashed p-12 rounded-3xl text-center text-zinc-600">
                                {queueData.playState === 'infoscreen' ? 'Waiting for a song to start...' : 'No song playing currently'}
                            </div>
                        )}
                    </div>

                    {/* Up Next */}
                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500 flex items-center gap-2">
                            <ListMusic size={12} /> Upcoming Queue
                        </h4>

                        <div className="space-y-2">
                            {queueData.upcoming && queueData.upcoming.length > 0 ? (
                                queueData.upcoming.map((song, i) => (
                                    <div key={i} className="bg-zinc-900/50 border border-zinc-800 p-3 rounded-xl flex items-center justify-between hover:bg-zinc-800/50 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-500">
                                                {i + 1}
                                            </div>
                                            <div>
                                                <p className="font-bold text-zinc-200 text-sm">{song.title}</p>
                                                <p className="text-xs text-zinc-500">{song.artist}</p>
                                            </div>
                                        </div>
                                        {song.singer && (
                                            <div className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded-md border border-indigo-500/20">
                                                {song.singer}
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-zinc-600 italic p-4">Queue is empty.</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
