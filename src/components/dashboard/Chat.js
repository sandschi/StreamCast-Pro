'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import tmi from 'tmi.js';
import { useAuth } from '@/context/AuthContext';
import { fetchThirdPartyEmotes, parseTwitchMessage } from '@/lib/emote-engine';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, setDoc, addDoc, serverTimestamp, onSnapshot, deleteDoc } from 'firebase/firestore';
// NEW: Icons for suggestions
import {
    ScreenShare,
    AlertCircle,
    Send,
    CheckCircle2,
    XCircle,
    HandHelping
} from 'lucide-react';

export default function Chat({ targetUid, isModeratorMode, isModAuthorized, userRole }) {
    const { user } = useAuth();
    const effectiveUid = useMemo(() => targetUid || user?.uid, [targetUid, user?.uid]);

    const [messages, setMessages] = useState([]);
    const [thirdPartyEmotes, setThirdPartyEmotes] = useState({ sevenTV: [], bttv: [], ffz: [] });
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [channelName, setChannelName] = useState(null);
    const [error, setError] = useState(null);
    const [suggestions, setSuggestions] = useState([]);

    const clientRef = useRef(null);
    const connectingRef = useRef(false);
    const scrollRef = useRef(null);
    const lastFetchedIdRef = useRef(null);
    const emotesRef = useRef({ sevenTV: [], bttv: [], ffz: [] });
    const channelRef = useRef(null);

    // Cache to prevent redundant avatar fetches in a single session
    const avatarCache = useRef({});

    useEffect(() => {
        emotesRef.current = thirdPartyEmotes;
    }, [thirdPartyEmotes]);

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
            client.on('message', async (channel, tags, message) => {
                const login = tags.username;
                const displayName = tags['display-name'] || login;

                // 1. Initial Placeholder (Dicebear - guaranteed to work)
                const placeholder = `https://api.dicebear.com/7.x/identicon/svg?seed=${login}&backgroundColor=b6e3f4,c0aede,d1d4f9`;

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
    }, [user, channelName]);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

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
    const [activeMessage, setActiveMessage] = useState(null);
    useEffect(() => {
        if (!effectiveUid) return;
        const msgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
        const unsub = onSnapshot(msgRef, (doc) => {
            setActiveMessage(doc.exists() ? doc.data() : null);
        });
        return () => unsub();
    }, [effectiveUid]);

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
            // duration: permanent ? -1 : null // null means use global setting, -1 means infinite. undefined is bad.
            // Wait, if I set null, OverlayPage logic: (data.duration !== undefined ? data.duration : settings)
            // null !== undefined is true. So duration becomes null.
            // if (duration > 0) -> null > 0 is false. So infinite.
            // So if I want "Standard", I should NOT send duration field at all?
            // Or send undefined? No, Firestore errors.
            // I should use "delete payload.duration" if standard.
        };

        if (permanent) {
            payload.duration = -1;
        }

        try {
            if (isViewer) {
                // ... (viewers can't send permanent anyway? or maybe they can suggest it? Let's keep it simple: Viewers suggest standard)
                const suggestionsRef = collection(db, 'users', effectiveUid, 'suggestions');
                // Remove duration for suggestions for now to avoid complexity
                if (payload.duration) delete payload.duration;
                await addDoc(suggestionsRef, payload);
                console.log('Suggestion Sent ✅');
            } else {
                // MODS/BROADCASTER: Send directly to screen
                const activeMsgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
                const historyRef = collection(db, 'users', effectiveUid, 'history');

                // Ensure duration is handled
                const finalPayload = { ...payload };
                if (!permanent) delete finalPayload.duration;

                await setDoc(activeMsgRef, finalPayload);
                await addDoc(historyRef, finalPayload);
                console.log('Sent to Screen ✅');
            }
        } catch (e) { console.error(e); }
    };

    const approveSuggestion = async (sug) => {
        try {
            const payload = { ...sug, timestamp: serverTimestamp() };
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

    return (
        <div className="flex flex-col flex-1 min-h-0 bg-transparent relative">
            {/* Hide Button (Floating) */}
            {activeMessage && (userRole === 'broadcaster' || userRole === 'mod') && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
                    <button
                        onClick={hideOverlay}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/90 hover:bg-red-500 text-white rounded-full text-xs font-bold transition-all shadow-xl animate-in fade-in slide-in-from-top-4"
                    >
                        <XCircle size={14} />
                        Hide Overlay
                    </button>
                </div>
            )}

            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center group">
                <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full animate-pulse transition-colors duration-500 ${connectionStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' :
                        connectionStatus === 'connecting' ? 'bg-yellow-500 animate-bounce' :
                            connectionStatus === 'error' ? 'bg-red-500' : 'bg-zinc-500'
                        }`} />
                    <span className="tracking-tight">Twitch Chat</span>
                    {connectionStatus === 'connected' && <span className="text-[10px] text-zinc-500 font-normal opacity-70">({channelName})</span>}
                </h3>
                <div className="flex items-center gap-2">
                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${userRole === 'broadcaster' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                        userRole === 'mod' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                            'bg-zinc-500/10 text-zinc-500 border-zinc-500/20'
                        }`}>
                        {userRole}
                    </div>
                </div>
            </div>

            {/* Suggestions Pool (Mods/Broadcasters Only) */}
            {userRole !== 'viewer' && suggestions.length > 0 && (
                <div className="bg-indigo-600/10 border-b border-indigo-500/20 overflow-x-auto scrollbar-hide">
                    <div className="p-3 flex items-center gap-3 min-w-max">
                        <div className="flex items-center gap-2 text-indigo-400 font-bold text-[10px] uppercase tracking-widest px-2 border-r border-indigo-500/20">
                            <HandHelping size={14} /> Suggestions
                        </div>
                        {suggestions.map(sug => (
                            <div key={sug.id} className="flex items-center gap-3 bg-zinc-900/80 p-2 rounded-xl border border-indigo-500/30 group/sug animate-in zoom-in-95 duration-200">
                                <div className="flex items-center gap-2 max-w-[150px]">
                                    <img src={sug.avatarUrl} alt="" className="w-4 h-4 rounded-full" />
                                    <span className="text-[11px] font-bold truncate" style={{ color: sug.color }}>{sug.username}:</span>
                                    <span className="text-[11px] text-zinc-300 truncate">{sug.fragments[0]?.content}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => approveSuggestion(sug)} className="p-1 text-green-500 hover:bg-green-500/10 rounded-lg transition-all" title="Approve">
                                        <CheckCircle2 size={14} />
                                    </button>
                                    <button onClick={() => denySuggestion(sug.id)} className="p-1 text-red-500 hover:bg-red-500/10 rounded-lg transition-all" title="Deny">
                                        <XCircle size={14} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {displayMessages.map((msg) => (
                    <div key={msg.id} className="group flex flex-col gap-1 bg-zinc-800/20 p-3 rounded-xl border border-white/5 hover:border-zinc-700 hover:bg-zinc-800/40 transition-all duration-200">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <img src={msg.avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover bg-zinc-800" />
                                <span className="font-bold text-sm tracking-wide" style={{ color: msg.color }}>
                                    {msg.username}
                                    {msg.isMod && <span className="ml-2 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full uppercase">MOD</span>}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {(userRole === 'broadcaster' || userRole === 'mod') && (
                                    <button
                                        onClick={() => sendToScreen(msg, true)}
                                        className="p-1.5 rounded-lg text-white transition-all scale-90 hover:scale-100 shadow-lg bg-zinc-700 hover:bg-zinc-600 shadow-zinc-900/20"
                                        title="Show Permanently (∞)"
                                    >
                                        <span className="text-[10px] font-bold">Send ∞</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => sendToScreen(msg)}
                                    className={`p-1.5 rounded-lg text-white transition-all scale-90 hover:scale-100 shadow-lg flex items-center gap-1.5 px-3 ${userRole === 'viewer' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/20' : 'bg-purple-600 hover:bg-purple-500 shadow-purple-600/20'
                                        }`}
                                >
                                    {userRole === 'viewer' ? (
                                        <>
                                            <Send size={12} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider">Suggest</span>
                                        </>
                                    ) : (
                                        <>
                                            <ScreenShare size={12} />
                                            <span className="text-[10px] font-bold uppercase tracking-wider">Show</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                        <div className="text-zinc-200 text-sm flex flex-wrap items-center gap-1.5 leading-relaxed pl-7">
                            {msg.fragments.map((frag, i) => (
                                frag.type === 'text' ? <span key={i}>{frag.content}</span> :
                                    <img key={i} src={frag.url} alt={frag.name} className="h-[1.2em] inline-block align-middle select-none" />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
