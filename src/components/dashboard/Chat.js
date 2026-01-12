'use client';

import React, { useEffect, useState, useRef } from 'react';
import tmi from 'tmi.js';
import { useAuth } from '@/context/AuthContext';
import { fetchThirdPartyEmotes, parseTwitchMessage } from '@/lib/emote-engine';
import { db } from '@/lib/firebase';
import { doc, setDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Send, ScreenShare } from 'lucide-react';

export default function Chat() {
    const { user } = useAuth();
    const [messages, setMessages] = useState([]);
    const [thirdPartyEmotes, setThirdPartyEmotes] = useState({});
    const clientRef = useRef(null);
    const scrollRef = useRef(null);

    useEffect(() => {
        if (!user) return;

        // Fetch emotes for the user's Twitch ID
        const twitchId = user.providerData[0].uid;
        const displayName = user.displayName;

        fetchThirdPartyEmotes(twitchId).then(setThirdPartyEmotes);

        const client = new tmi.Client({
            channels: [displayName.toLowerCase()]
        });

        client.connect();
        clientRef.current = client;

        client.on('message', (channel, tags, message, self) => {
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
    }, [user, thirdPartyEmotes.length]); // Re-run if emotes list changes length (initial load)

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const sendToScreen = async (msg) => {
        if (!user) return;

        const activeMsgRef = doc(db, 'users', user.uid, 'active_message', 'current');
        const historyRef = collection(db, 'users', user.uid, 'history');

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
                    <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                    Live Twitch Chat
                </h3>
            </div>

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
                                    <img key={i} src={frag.url} alt={frag.name} className="h-6 inline-block" />
                                )
                            ))}
                        </div>
                    </div>
                ))}
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-2 opacity-50">
                        <p>Waiting for chat messages...</p>
                        <p className="text-xs italic">Make sure you are live or someone is typing in your chat!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
