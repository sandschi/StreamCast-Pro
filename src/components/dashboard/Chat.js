'use client';

import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import tmi from 'tmi.js';
import { useAuth } from '@/context/AuthContext';
import { fetchThirdPartyEmotes, parseTwitchMessage } from '@/lib/emote-engine';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { ScreenShare, AlertCircle } from 'lucide-react';

export default function Chat({ targetUid, isModeratorMode }) {
    const { user } = useAuth();

    // Stabilize the UID to prevent effect thrashing
    const effectiveUid = useMemo(() => targetUid || user?.uid, [targetUid, user?.uid]);

    const [messages, setMessages] = useState([]);
    const [thirdPartyEmotes, setThirdPartyEmotes] = useState({ sevenTV: [], bttv: [], ffz: [] });
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [channelName, setChannelName] = useState(null);
    const [error, setError] = useState(null);

    const clientRef = useRef(null);
    const connectingRef = useRef(false);
    const scrollRef = useRef(null);
    const lastFetchedIdRef = useRef(null);
    const emotesRef = useRef({ sevenTV: [], bttv: [], ffz: [] });
    const channelRef = useRef(null);

    // 1. Emote Optimization: Sync ref and re-parse on arrival
    useEffect(() => {
        emotesRef.current = thirdPartyEmotes;

        const hasEmotes = Object.values(thirdPartyEmotes).some(arr => arr.length > 0);
        if (hasEmotes && messages.length > 0) {
            setMessages(prev => prev.map(msg => ({
                ...msg,
                fragments: parseTwitchMessage(msg.message, msg.rawEmotes, thirdPartyEmotes)
            })));
        }
    }, [thirdPartyEmotes]);

    // 2. Data Fetching (Highly Defensive)
    useEffect(() => {
        if (!user || !effectiveUid) return;

        let active = true;
        const fetchUserData = async (retries = 3) => {
            try {
                const userDoc = await getDoc(doc(db, 'users', effectiveUid));
                if (!active || !userDoc.exists()) return;

                const data = userDoc.data();
                const name = (data.twitchUsername || data.displayName || (effectiveUid === user.uid ? user.displayName : null))?.toLowerCase().trim();

                // Only update if it's a real change to avoid re-triggering connection effect
                if (name && name !== channelRef.current) {
                    channelRef.current = name;
                    setChannelName(name);
                    setError(null);
                } else if (!name && retries > 0) {
                    setTimeout(() => fetchUserData(retries - 1), 2000);
                }

                const bId = data.twitchId || (effectiveUid === user.uid ? user.providerData[0]?.uid : null);
                if (bId && lastFetchedIdRef.current !== bId) {
                    lastFetchedIdRef.current = bId;
                    console.log(`Chat: Initializing emotes for: ${bId}`);
                    const fetched = await fetchThirdPartyEmotes(bId);
                    if (active) {
                        console.log(`Chat: Emotes loaded (${fetched.sevenTV.length + fetched.bttv.length + fetched.ffz.length} total)`);
                        setThirdPartyEmotes(fetched);
                    }
                }
            } catch (e) {
                console.error('Chat: Data error:', e);
            }
        };

        fetchUserData();
        return () => { active = false; };
    }, [user?.uid, effectiveUid]); // Depend on UID strictly

    // 3. TMI Connection Management
    useEffect(() => {
        if (!user || !channelName || connectingRef.current) return;

        const connectToTwitch = async () => {
            // Clean up old instance first
            if (clientRef.current) {
                try {
                    clientRef.current.removeAllListeners();
                    await clientRef.current.disconnect();
                } catch (e) { }
                clientRef.current = null;
            }

            connectingRef.current = true;
            setConnectionStatus('connecting');

            const client = new tmi.Client({
                connection: { secure: true, reconnect: true },
                channels: [channelName]
            });

            clientRef.current = client;

            client.on('connected', () => {
                setConnectionStatus('connected');
                connectingRef.current = false;
            });

            client.on('disconnected', (reason) => {
                console.warn(`Chat: Disconnected (${reason})`);
                setConnectionStatus('disconnected');
                connectingRef.current = false;
            });

            client.on('message', (channel, tags, message) => {
                const username = tags['display-name'] || tags.username;
                const newMessage = {
                    id: tags.id || Math.random().toString(36).substr(2, 9),
                    username,
                    avatarUrl: `https://decapi.me/twitch/avatar/${username.toLowerCase()}`,
                    color: tags.color || '#efeff1',
                    message,
                    rawEmotes: tags.emotes,
                    fragments: parseTwitchMessage(message, tags.emotes, emotesRef.current),
                    timestamp: new Date(),
                    isMod: tags.mod || tags.badges?.broadcaster === '1',
                };
                setMessages(prev => [...prev.slice(-49), newMessage]);
            });

            try {
                await client.connect();
            } catch (err) {
                console.error('Chat: TMI connection failed:', err);
                if (connectingRef.current) {
                    setConnectionStatus('error');
                    connectingRef.current = false;
                }
            }
        };

        connectToTwitch();

        return () => {
            if (clientRef.current) {
                const c = clientRef.current;
                c.removeAllListeners();
                c.disconnect().catch(() => { });
                clientRef.current = null;
            }
            connectingRef.current = false;
        };
    }, [user?.uid, channelName]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const sendToScreen = async (msg) => {
        if (!user) return;
        const activeMsgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
        const historyRef = collection(db, 'users', effectiveUid, 'history');
        const payload = {
            username: msg.username,
            avatarUrl: msg.avatarUrl,
            color: msg.color,
            fragments: msg.fragments,
            timestamp: serverTimestamp(),
        };
        try {
            await setDoc(activeMsgRef, payload);
            await addDoc(historyRef, payload);
        } catch (e) {
            console.error('Error sending message:', e);
        }
    };

    return (
        <div className="flex flex-col h-[600px] bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full animate-pulse transition-colors duration-500 ${connectionStatus === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' :
                            connectionStatus === 'connecting' ? 'bg-yellow-500 animate-bounce' :
                                connectionStatus === 'error' ? 'bg-red-500' : 'bg-zinc-500'
                        }`} />
                    <span className="tracking-tight">Twitch Chat</span>
                    {connectionStatus === 'connected' && <span className="text-[10px] text-zinc-500 font-normal opacity-70">({channelName})</span>}
                </h3>
            </div>

            {error && (
                <div className="m-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-3 text-red-400 text-sm">
                    <AlertCircle size={18} className="shrink-0" />
                    <p>{error}</p>
                </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {messages.map((msg) => (
                    <div key={msg.id} className="group flex flex-col gap-1 bg-zinc-800/20 p-3 rounded-xl border border-white/5 hover:border-zinc-700 hover:bg-zinc-800/40 transition-all duration-200">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-sm tracking-wide" style={{ color: msg.color }}>
                                {msg.username}
                                {msg.isMod && <span className="ml-2 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full uppercase">MOD</span>}
                            </span>
                            <button
                                onClick={() => sendToScreen(msg)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-all scale-90 hover:scale-100 shadow-lg shadow-purple-600/20"
                            >
                                <ScreenShare size={14} />
                            </button>
                        </div>
                        <div className="text-zinc-200 text-sm flex flex-wrap items-center gap-1.5 leading-relaxed">
                            {msg.fragments.map((frag, i) => (
                                frag.type === 'text' ? <span key={i}>{frag.content}</span> :
                                    <img key={i} src={frag.url} alt={frag.name} className="h-6 inline-block align-middle select-none" />
                            ))}
                        </div>
                    </div>
                ))}
                {messages.length === 0 && !error && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2 opacity-50 select-none">
                        <div className="w-8 h-8 rounded-full border-2 border-zinc-800 border-t-zinc-600 animate-spin mb-2" />
                        <p className="text-sm">Connecting to chat stream...</p>
                    </div>
                )}
            </div>
        </div>
    );
}
