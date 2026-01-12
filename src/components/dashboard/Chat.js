'use client';

import React, { useEffect, useState, useRef } from 'react';
import tmi from 'tmi.js';
import { useAuth } from '@/context/AuthContext';
import { fetchThirdPartyEmotes, parseTwitchMessage } from '@/lib/emote-engine';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Send, ScreenShare, AlertCircle } from 'lucide-react';

export default function Chat({ targetUid }) {
    const { user } = useAuth();
    // Use targetUid if provided (Host mode), fallback to current user
    const effectiveUid = targetUid || user?.uid;
    const [messages, setMessages] = useState([]);
    const [thirdPartyEmotes, setThirdPartyEmotes] = useState({});
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [channelName, setChannelName] = useState(null);
    const [error, setError] = useState(null);
    const clientRef = useRef(null);
    const scrollRef = useRef(null);
    const lastFetchedIdRef = useRef(null);

    // 1. Fetch the correct channel name (Twitch username) from Firestore
    useEffect(() => {
        if (!user) return;

        const fetchUserData = async (retries = 3) => {
            try {
                const userDoc = await getDoc(doc(db, 'users', effectiveUid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    const name = data.twitchUsername || user.displayName || user.providerData[0]?.displayName;
                    if (name) {
                        setChannelName(name.toLowerCase());
                        setError(null);
                    } else if (retries > 0) {
                        setTimeout(() => fetchUserData(retries - 1), 2000);
                    } else {
                        setError('Could not find your Twitch username. Please set it manually in Settings.');
                    }
                } else {
                    if (retries > 0) {
                        setTimeout(() => fetchUserData(retries - 1), 2000);
                    } else {
                        setError('User profile not found. Please try logging out and back in.');
                    }
                }
            } catch (e) {
                console.error('Chat: Firestore error:', e);
                if (e.message?.includes('blocked') || e.code === 'unavailable') {
                    setError('Firestore is blocked. Please disable your Ad-Blocker or Privacy extensions.');
                }
            }
        };

        fetchUserData();
    }, [user, effectiveUid]);

    // 2. Fetch Third-Party Emotes (Optimized)
    useEffect(() => {
        const twitchId = user?.providerData[0]?.uid;
        if (!twitchId || lastFetchedIdRef.current === twitchId) return;

        lastFetchedIdRef.current = twitchId;
        fetchThirdPartyEmotes(twitchId).then(setThirdPartyEmotes);
    }, [user]);

    // 3. Connect to Twitch IRC (TMI)
    useEffect(() => {
        if (!user || !channelName) return;

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
        client.on('message', (channel, tags, message) => {
            // We use the latest thirdPartyEmotes from state here
            // Note: because this listener is created once, we must use a ref if thirdPartyEmotes changes often
            // but since it's fetched once per login, it's usually fine.
            const parsedFragments = parseTwitchMessage(message, tags.emotes, thirdPartyEmotes);
            const newMessage = {
                id: tags.id,
                username: tags['display-name'],
                color: tags.color || '#efeff1',
                message,
                fragments: parsedFragments,
                timestamp: new Date(),
                isMod: tags.mod || tags.badges?.broadcaster === '1',
            };
            setMessages(prev => [...prev.slice(-50), newMessage]);
        });

        return () => {
            if (clientRef.current) clientRef.current.disconnect();
        };
    }, [user, channelName]); // Removed thirdPartyEmotes from deps to avoid re-connecting on every emote load

    // 4. Update message parsing when emotes load (optional but better)
    // If messages arrive BEFORE emotes are loaded, they won't have them. 
    // Usually emotes load very fast, so this is rarely an issue in TMI contexts.

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
                                frag.type === 'text' ? <span key={i}>{frag.content}</span> : <img key={i} src={frag.url} alt={frag.name} className="h-6 inline-block" />
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
