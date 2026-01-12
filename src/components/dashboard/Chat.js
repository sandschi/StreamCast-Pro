'use client';

import React, { useEffect, useState, useRef } from 'react';
import tmi from 'tmi.js';
import { useAuth } from '@/context/AuthContext';
import { fetchThirdPartyEmotes, parseTwitchMessage } from '@/lib/emote-engine';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Send, ScreenShare, AlertCircle } from 'lucide-react';

export default function Chat({ targetUid, isModeratorMode }) {
    const { user } = useAuth();
    const effectiveUid = targetUid || user?.uid;

    const [messages, setMessages] = useState([]);
    const [thirdPartyEmotes, setThirdPartyEmotes] = useState({ sevenTV: [], bttv: [], ffz: [] });
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [channelName, setChannelName] = useState(null);
    const [error, setError] = useState(null);

    const clientRef = useRef(null);
    const scrollRef = useRef(null);
    const lastFetchedIdRef = useRef(null);
    const emotesRef = useRef({ sevenTV: [], bttv: [], ffz: [] });

    // Sync ref with state
    useEffect(() => {
        emotesRef.current = thirdPartyEmotes;

        // When emotes load, re-parse existing messages to show emotes immediately
        if (messages.length > 0) {
            setMessages(prev => prev.map(msg => ({
                ...msg,
                fragments: parseTwitchMessage(msg.message, msg.rawEmotes, thirdPartyEmotes)
            })));
        }
    }, [thirdPartyEmotes]);

    // 1. Fetch channel info and Broadcaster Twitch ID from Firestore
    useEffect(() => {
        if (!user || !effectiveUid) return;

        const fetchUserData = async (retries = 3) => {
            try {
                const userDoc = await getDoc(doc(db, 'users', effectiveUid));
                if (userDoc.exists()) {
                    const data = userDoc.data();

                    // Set channel name: Priority to twitchUsername field, then stored displayName, then current login (only if not in Host Mode)
                    const name = data.twitchUsername || data.displayName || (effectiveUid === user.uid ? user.displayName : null);

                    if (name) {
                        setChannelName(name.toLowerCase().trim());
                        setError(null);
                    } else if (retries > 0) {
                        setTimeout(() => fetchUserData(retries - 1), 2000);
                    } else {
                        setError('Broadcaster identity not fully synced. Please ensure they have logged in and set their channel name.');
                    }

                    // Fetch Emotes for the TARGET user (broadcaster)
                    const broadcasterTwitchId = data.twitchId || (effectiveUid === user.uid ? user.providerData[0]?.uid : null);
                    if (broadcasterTwitchId && lastFetchedIdRef.current !== broadcasterTwitchId) {
                        lastFetchedIdRef.current = broadcasterTwitchId;
                        console.log(`Chat: Fetching emotes for Twitch ID: ${broadcasterTwitchId}`);
                        fetchThirdPartyEmotes(broadcasterTwitchId).then(fetched => {
                            console.log(`Chat: Loaded ${fetched.sevenTV.length + fetched.bttv.length + fetched.ffz.length} third-party emotes.`);
                            setThirdPartyEmotes(fetched);
                        });
                    }
                }
            } catch (e) {
                console.error('Chat: Firestore error:', e);
            }
        };

        fetchUserData();
    }, [user, effectiveUid]);

    // 2. Connect to Twitch IRC (TMI)
    useEffect(() => {
        if (!user || !channelName) return;

        // Prevent multiple connections
        if (clientRef.current) {
            clientRef.current.disconnect();
        }

        setConnectionStatus('connecting');

        const client = new tmi.Client({
            connection: { secure: true, reconnect: true },
            channels: [channelName]
        });

        client.connect().catch(err => {
            console.error('Chat: Connection error:', err);
            setConnectionStatus('error');
        });

        clientRef.current = client;

        client.on('connected', () => setConnectionStatus('connected'));
        client.on('message', async (channel, tags, message) => {
            // Use emotesRef.current to avoid stale closure
            const parsedFragments = parseTwitchMessage(message, tags.emotes, emotesRef.current);

            // Get avatar URL (DecAPI is a reliable public mirror for Twitch avatars)
            const username = tags['display-name'] || tags.username;
            const avatarUrl = `https://decapi.me/twitch/avatar/${username.toLowerCase()}`;

            const newMessage = {
                id: tags.id || Math.random().toString(36).substr(2, 9),
                username,
                avatarUrl,
                color: tags.color || '#efeff1',
                message,
                rawEmotes: tags.emotes, // Store for re-parsing
                fragments: parsedFragments,
                timestamp: new Date(),
                isMod: tags.mod || tags.badges?.broadcaster === '1',
            };
            setMessages(prev => [...prev.slice(-50), newMessage]);
        });

        return () => {
            if (clientRef.current) clientRef.current.disconnect();
        };
    }, [channelName]); // Only reconnect if channel changes

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
            console.error('Error sending to screen:', e);
        }
    };

    return (
        <div className="flex flex-col h-[600px] bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full animate-pulse ${connectionStatus === 'connected' ? 'bg-green-500' :
                        connectionStatus === 'connecting' ? 'bg-yellow-500' :
                            connectionStatus === 'error' ? 'bg-red-500' : 'bg-zinc-500'
                        }`} />
                    Twitch Chat {connectionStatus === 'connected' && <span className="text-[10px] text-zinc-500 font-normal">({channelName})</span>}
                </h3>
            </div>

            {error && (
                <div className="m-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex gap-3 text-red-400 text-sm animate-in fade-in slide-in-from-top-1">
                    <AlertCircle size={18} className="shrink-0" />
                    <p>{error}</p>
                </div>
            )}

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
                {messages.map((msg) => (
                    <div key={msg.id} className="group flex flex-col gap-1 bg-zinc-800/30 p-3 rounded-lg border border-transparent hover:border-zinc-700 transition-all">
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-sm" style={{ color: msg.color }}>
                                {msg.username}
                                {msg.isMod && <span className="ml-2 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">MOD</span>}
                            </span>
                            <button
                                onClick={() => sendToScreen(msg)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 bg-purple-600 hover:bg-purple-500 rounded text-white transition-all scale-90 hover:scale-100"
                                title="Send to Screen"
                            >
                                <ScreenShare size={14} />
                            </button>
                        </div>
                        <div className="text-zinc-200 text-sm flex flex-wrap items-center gap-1 leading-relaxed">
                            {msg.fragments.map((frag, i) => (
                                frag.type === 'text' ? (
                                    <span key={i}>{frag.content}</span>
                                ) : (
                                    <img
                                        key={i}
                                        src={frag.url}
                                        alt={frag.name}
                                        className="h-6 inline-block align-middle"
                                        onError={(e) => {
                                            console.warn(`Emote failed to load: ${frag.url}`);
                                            // Optional: replace with text
                                        }}
                                    />
                                )
                            ))}
                        </div>
                    </div>
                ))}
                {messages.length === 0 && !error && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2 opacity-50">
                        <p>Waiting for chat messages...</p>
                        <p className="text-xs italic">Make sure you are live or someone is typing in your chat!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
