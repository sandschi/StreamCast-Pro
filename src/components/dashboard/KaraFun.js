'use client';

import React, { useEffect, useState } from 'react';
import { Music, RefreshCw, AlertCircle, Play, ListMusic, User, Save } from 'lucide-react';
import { db } from '@/lib/firebase';
import { doc, updateDoc } from 'firebase/firestore';

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
        let ws = null;
        let reconnectTimeout = null;

        const connect = async () => {
            try {
                // Discovery Phase: Get the specific KCS URL for this session
                // We need to bypass potential CORS/Forbidden issues if possible, 
                // but usually the remote client does this via a direct fetch.
                let baseUrl = `https://www.karafun.com/${partyId}/`;
                try {
                    const response = await fetch(`${baseUrl}?type=session_info&hash=`, {
                        headers: {
                            'Accept': 'application/json'
                        }
                    });
                    if (response.ok) {
                        const data = await response.json();
                        if (data.kcs_url) {
                            console.log('KaraFun Sync: Discovered KCS URL:', data.kcs_url);
                            ws = new WebSocket(data.kcs_url, ['kcpj~v2+emuping']);
                        }
                    }
                } catch (discoveryError) {
                    console.warn('KaraFun Sync: Discovery failed, falling back to default endpoint', discoveryError);
                }

                // Fallback to default if discovery didn't create a socket
                if (!ws) {
                    ws = new WebSocket('wss://www.karafun.com/remote/', ['kcpj~v2+emuping']);
                }

                ws.onopen = () => {
                    if (!ws) return; // Guard against race conditions during reconnect
                    console.log('KaraFun Sync: Connected to', partyId);
                    setError(null);

                    // Handshake: Identify as a guest for this channel
                    ws.send(JSON.stringify({
                        id: 1,
                        type: "auth.ProcessRemoteLoginRequest",
                        payload: { channel: partyId }
                    }));

                    // Request initial status and queue
                    ws.send(JSON.stringify({
                        id: 2,
                        type: "remote.StatusRequest",
                        payload: {}
                    }));
                    ws.send(JSON.stringify({
                        id: 3,
                        type: "remote.QueueRequest",
                        payload: {}
                    }));
                };

                ws.onmessage = (event) => {
                    if (!ws) return;
                    try {
                        const data = JSON.parse(event.data);

                        // Handle server-side pings to keep connection alive
                        if (data.type === 'core.PingRequest' || data.type === 'auth.ProcessRemoteLoginRequest') {
                            ws.send(JSON.stringify({
                                id: data.id,
                                type: data.type === 'core.PingRequest' ? "core.PingResponse" : "auth.ProcessRemoteLoginResponse",
                                payload: {}
                            }));
                            return;
                        }

                        // Update queue data
                        if (data.type === 'remote.QueueEvent' || data.type === 'remote.QueueResponse') {
                            const items = data.payload.queue?.items || [];
                            const transformed = items.map(item => ({
                                title: item.song?.title || item.quiz?.title || 'Unknown',
                                artist: item.song?.artist || '',
                                singer: item.options?.singer || ''
                            }));

                            setQueueData(prev => ({
                                ...prev,
                                upcoming: transformed,
                                timestamp: Date.now()
                            }));
                            setLastUpdated(new Date());
                            setLoading(false);
                            setError(null);
                        }

                        // Update current song status
                        if (data.type === 'remote.StatusEvent' || data.type === 'remote.StatusResponse') {
                            const current = data.payload.status?.current;
                            if (current) {
                                setQueueData(prev => ({
                                    ...prev,
                                    currentSong: {
                                        title: current.song?.title || current.quiz?.title || 'Unknown',
                                        artist: current.song?.artist || '',
                                        singer: current.options?.singer || ''
                                    }
                                }));
                            } else {
                                setQueueData(prev => ({ ...prev, currentSong: null }));
                            }
                            setLoading(false);
                            setError(null);
                        }
                    } catch (e) {
                        console.error('Error parsing KaraFun message:', e);
                    }
                };

                ws.onclose = (e) => {
                    console.log('KaraFun Sync: Disconnected', e.code, e.reason);
                    ws = null;
                    if (userSettings?.karafunEnabled) {
                        reconnectTimeout = setTimeout(() => connect(), 5000); // Retry every 5s
                    }
                };

                ws.onerror = (err) => {
                    console.error('KaraFun Sync Error:', err);
                    setError("Connection intermittent. Retrying...");
                };

            } catch (err) {
                console.error('WebSocket creation error:', err);
                setError("Failed to initialize sync.");
            }
        };

        connect();

        return () => {
            if (ws) {
                ws.onclose = null; // Prevent reconnect on intentional close
                ws.close();
            }
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
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
                        placeholder="Enter KaraFun Party ID (e.g. 123456)"
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
                                {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : 'Syncing...'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => { setLoading(true); fetchQueue(); }}
                        className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400"
                        title="Force Refresh"
                    >
                        <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            )}

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center gap-3 text-red-200 text-sm">
                    <AlertCircle size={18} />
                    {error}
                </div>
            )}

            {loading && !queueData && (
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
                                No song playing currently
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
