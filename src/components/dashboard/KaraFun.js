'use client';

import React, { useEffect, useState } from 'react';
import { Music, RefreshCw, AlertCircle, Play, ListMusic, User, Save, Monitor, Type, Move } from 'lucide-react';

const FONTS = [
    'Inter', 'Roboto', 'Poppins', 'Montserrat', 'Oswald',
    'Ubuntu', 'Raleway', 'Playfair Display', 'Bangers', 'Pacifico', 'Monoton'
];
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
            await updateDoc(configRef, { karafunPartyId: tempPartyId });
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
            await updateDoc(configRef, { [field]: value });
        } catch (err) {
            console.error(`Error saving ${field}:`, err);
        }
    };

    useEffect(() => {
        if (!partyId || !userSettings?.karafunEnabled) return;

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

    if (!userSettings?.karafunEnabled) {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-zinc-500">
                <Music size={48} className="mb-4 opacity-20" />
                <p>KaraFun integration is disabled.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-4xl pb-32">
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

            {/* OVERLAY CONFIGURATION SECTION */}
            <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl space-y-4">
                <div className="flex items-center gap-3 mb-2">
                    <div className="bg-pink-500/20 p-2 rounded-lg">
                        <Monitor className="text-pink-400" size={18} />
                    </div>
                    <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Overlay Settings</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-center gap-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors">
                        <div className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={userSettings?.karafunOverlayQueueEnabled || false}
                                onChange={(e) => handleToggleSetting('karafunOverlayQueueEnabled', e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                        </div>
                        <span className="font-medium text-zinc-300">Show Queue (Next 5 Songs)</span>
                    </label>

                    <label className="flex items-center gap-3 bg-zinc-950 p-4 rounded-xl border border-zinc-800 cursor-pointer hover:border-zinc-700 transition-colors">
                        <div className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={userSettings?.karafunOverlayNowPlayingEnabled || false}
                                onChange={(e) => handleToggleSetting('karafunOverlayNowPlayingEnabled', e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-pink-600"></div>
                        </div>
                        <span className="font-medium text-zinc-300">Show Now Playing Popup</span>
                    </label>

                    <div className="md:col-span-2 bg-zinc-950 p-4 rounded-xl border border-zinc-800 flex items-center justify-between">
                        <span className="font-medium text-zinc-300">Overlay Theme</span>
                        <select
                            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-100 outline-none focus:border-pink-500 transition-colors cursor-pointer"
                            value={userSettings?.karafunOverlayTheme || 'classic'}
                            onChange={(e) => handleToggleSetting('karafunOverlayTheme', e.target.value)}
                        >
                            <option value="classic">Classic</option>
                            <option value="glass">Glass</option>
                            <option value="neon">Neon</option>
                            <option value="minimal">Minimal</option>
                            <option value="cyberpunk">Cyberpunk</option>
                            <option value="retro">Retro</option>
                            <option value="comic">Comic</option>
                            <option value="future">Future</option>
                        </select>
                    </div>
                </div>

                {/* OVERLAY STYLING & POSITIONING SECTION */}
                <div className="pt-6 border-t border-zinc-800">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                            <Type className="text-blue-400" size={18} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Typography & Colors</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2 select-none">
                            <label className="text-xs font-bold text-zinc-400 uppercase">Font Family</label>
                            <select
                                value={userSettings?.karafunFontFamily || 'Inter'}
                                onChange={(e) => handleToggleSetting('karafunFontFamily', e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-zinc-200 outline-none focus:ring-2 focus:ring-blue-600/50"
                            >
                                {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2 select-none">
                            <label className="text-xs font-bold text-zinc-400 uppercase">Primary Text Color</label>
                            <div className="flex gap-2">
                                <input
                                    type="color"
                                    value={userSettings?.karafunTextColor || '#ffffff'}
                                    onChange={(e) => handleToggleSetting('karafunTextColor', e.target.value)}
                                    className="w-10 h-10 rounded-lg bg-zinc-950 border-none cursor-pointer p-0"
                                />
                                <input
                                    type="text"
                                    value={userSettings?.karafunTextColor || '#ffffff'}
                                    readOnly
                                    className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 text-[10px] text-zinc-500 uppercase font-mono"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-6 border-t border-zinc-800">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-green-500/20 p-2 rounded-lg">
                            <Move className="text-green-400" size={18} />
                        </div>
                        <h4 className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Precision Positioning</h4>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 select-none">
                        {/* Queue Position */}
                        <div className="space-y-4 bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                            <h5 className="text-xs font-bold text-zinc-300 uppercase flex items-center gap-2 mb-2">
                                <ListMusic size={14} className="text-zinc-500" /> Queue Overlay
                            </h5>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-500 uppercase flex justify-between">Horizontal (X) <span className="text-green-500">{userSettings?.karafunQueuePosX ?? 5}%</span></label>
                                <input type="range" min="0" max="100" value={userSettings?.karafunQueuePosX ?? 5} onChange={(e) => handleToggleSetting('karafunQueuePosX', parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500 outline-none" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-500 uppercase flex justify-between">Vertical (Y) <span className="text-green-500">{userSettings?.karafunQueuePosY ?? 5}%</span></label>
                                <input type="range" min="0" max="100" value={userSettings?.karafunQueuePosY ?? 5} onChange={(e) => handleToggleSetting('karafunQueuePosY', parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500 outline-none" />
                            </div>
                        </div>

                        {/* Now Playing Position */}
                        <div className="space-y-4 bg-zinc-950 p-4 rounded-2xl border border-zinc-800">
                            <h5 className="text-xs font-bold text-zinc-300 uppercase flex items-center gap-2 mb-2">
                                <Play size={14} className="text-zinc-500" /> Now Playing Overlay
                            </h5>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-500 uppercase flex justify-between">Horizontal (X) <span className="text-green-500">{userSettings?.karafunNowPlayingPosX ?? 50}%</span></label>
                                <input type="range" min="0" max="100" value={userSettings?.karafunNowPlayingPosX ?? 50} onChange={(e) => handleToggleSetting('karafunNowPlayingPosX', parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500 outline-none" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-500 uppercase flex justify-between">Vertical (Y) <span className="text-green-500">{userSettings?.karafunNowPlayingPosY ?? 90}%</span></label>
                                <input type="range" min="0" max="100" value={userSettings?.karafunNowPlayingPosY ?? 90} onChange={(e) => handleToggleSetting('karafunNowPlayingPosY', parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500 outline-none" />
                            </div>
                        </div>
                    </div>
                </div>
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
                    <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${error ? 'bg-red-500' : lastUpdated ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`} title={error ? 'Disconnected' : lastUpdated ? 'Connected' : 'Connecting...'} />
                        <button
                            onClick={handleReconnect}
                            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-zinc-100"
                            title="Force Reconnect"
                        >
                            <RefreshCw size={16} className={loading && !lastUpdated ? 'animate-spin' : ''} />
                        </button>
                    </div>
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
