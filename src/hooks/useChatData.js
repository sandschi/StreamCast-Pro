'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import tmi from 'tmi.js';
import { useAuth } from '@/context/AuthContext';
import { fetchThirdPartyEmotes, parseTwitchMessage } from '@/lib/emote-engine';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, setDoc, addDoc, serverTimestamp, onSnapshot, deleteDoc } from 'firebase/firestore';

// Extracted verbatim from the original inline logic in components/dashboard/Chat.js
// so both the classic and dashboard-shell presentations run the exact same real
// tmi.js/Firestore wiring rather than duplicating it. No behavior changes.
export function useChatData({ targetUid, userRole, enabled = true }) {
    const { user } = useAuth();
    const effectiveUid = useMemo(() => (enabled ? (targetUid || user?.uid) : null), [enabled, targetUid, user?.uid]);

    const [messages, setMessages] = useState([]);
    const [thirdPartyEmotes, setThirdPartyEmotes] = useState({ sevenTV: [], bttv: [], ffz: [] });
    const [connectionStatus, setConnectionStatus] = useState('disconnected');
    const [channelName, setChannelName] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [activeMessage, setActiveMessage] = useState(null);

    const clientRef = useRef(null);
    const connectingRef = useRef(false);
    const lastFetchedIdRef = useRef(null);
    const emotesRef = useRef({ sevenTV: [], bttv: [], ffz: [] });
    const channelRef = useRef(null);
    const [reconnectNonce, setReconnectNonce] = useState(0);
    const reconnect = () => setReconnectNonce(n => n + 1);

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

                const placeholder = null;

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
    }, [user, channelName, reconnectNonce]);

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
        };

        if (permanent) {
            payload.duration = -1;
        }

        try {
            if (isViewer) {
                const suggestionsRef = collection(db, 'users', effectiveUid, 'suggestions');
                if (payload.duration) delete payload.duration;
                await addDoc(suggestionsRef, payload);
                console.log('Suggestion Sent ✅');
            } else {
                // MODS/BROADCASTER: Send directly to screen
                const activeMsgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
                const historyRef = collection(db, 'users', effectiveUid, 'history');

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

    // Local-only: the live chat log is ephemeral React state, not persisted
    // anywhere (a page reload already clears it), so clearing it needs no
    // Firestore write.
    const clearMessages = () => setMessages([]);

    return {
        effectiveUid,
        displayMessages,
        connectionStatus,
        channelName,
        suggestions,
        activeMessage,
        hideOverlay,
        sendToScreen,
        approveSuggestion,
        denySuggestion,
        reconnect,
        clearMessages,
    };
}
