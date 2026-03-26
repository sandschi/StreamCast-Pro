'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc, deleteDoc, addDoc, serverTimestamp } from 'firebase/firestore';
// NEW: Icons for Suggestion
import { History as HistoryIcon, RefreshCw, Send, ScreenShare, XCircle, Clock } from 'lucide-react';
import { formatTimestamp } from '../../lib/utils';

export default function History({ targetUid, isModeratorMode, isModAuthorized, userRole }) {
    const { user } = useAuth();
    const effectiveUid = targetUid || user?.uid;
    const [history, setHistory] = useState([]); // Restored missing state

    useEffect(() => {
        if (!effectiveUid) return;

        const historyRef = collection(db, 'users', effectiveUid, 'history');
        const q = query(historyRef, orderBy('timestamp', 'desc'), limit(50));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setHistory(messages);
        });

        return () => unsubscribe();
    }, [effectiveUid]);

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

    const resendToScreen = async (msg, permanent = false) => {
        if (!user || userRole === 'denied') return;

        const isViewer = userRole === 'viewer';
        const payload = {
            ...msg,
            timestamp: serverTimestamp(),
            suggestedBy: user.uid,
            suggestedByName: user.displayName,
            fromHistory: true
        };
        delete payload.id;

        if (permanent) {
            payload.duration = -1;
        } else {
            if (payload.duration) delete payload.duration;
        }

        try {
            if (isViewer) {
                // VIEWERS: Suggest from history
                const suggestionsRef = collection(db, 'users', effectiveUid, 'suggestions');
                if (payload.duration) delete payload.duration;
                await addDoc(suggestionsRef, payload);
                console.log('History Suggestion Sent ✅');
            } else {
                // MODS/BROADCASTER: Show directly
                const activeMsgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
                await setDoc(activeMsgRef, payload);
                console.log('History Sent to Screen ✅');
            }
        } catch (e) { console.error(e); }
    };

    return (
        <div className="flex flex-col h-full bg-transparent relative">
            {/* Hide Button (Floating) */}
            {activeMessage && (userRole === 'broadcaster' || userRole === 'mod') && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50">
                    <button
                        onClick={hideOverlay}
                        className="btn-awesome !bg-zinc-800 !text-white !shadow-none hover:!bg-zinc-700"
                    >
                        <XCircle size={14} />
                        Hide Overlay
                    </button>
                </div>
            )}

            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
                    <HistoryIcon size={18} className="text-zinc-400" />
                    Message History
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {history.map((msg) => (
                    <div key={msg.id} className="group flex flex-col gap-1 bg-zinc-800/20 p-3 rounded-lg border border-zinc-800/50 hover:bg-zinc-800/40 transition-all">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                {msg.avatarUrl && (
                                    <div className="relative w-4 h-4 overflow-hidden rounded-full border border-white/10 shrink-0">
                                        <Image src={msg.avatarUrl} alt="" fill className="object-cover" />
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs" style={{ color: msg.color }}>
                                        {msg.username}
                                    </span>
                                    {msg.timestamp && (
                                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300 tabular-nums">
                                            <span className="text-zinc-600">•</span>
                                            {formatTimestamp(msg.timestamp)}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {(userRole === 'broadcaster' || userRole === 'mod') && (
                                        <button
                                            onClick={() => resendToScreen(msg, true)}
                                            className="px-3 py-1.5 rounded-full text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all scale-95 hover:scale-100 shadow-md"
                                            title="Show Permanently (∞)"
                                        >
                                            <span className="text-[10px] font-black uppercase tracking-tighter">Send ∞</span>
                                        </button>
                                )}
                                <button
                                    onClick={() => resendToScreen(msg)}
                                    className="btn-awesome !px-4 !py-1.5"
                                >
                                    {userRole === 'viewer' ? <Send size={12} /> : <ScreenShare size={12} />}
                                    <span>{userRole === 'viewer' ? 'Suggest' : 'Show'}</span>
                                </button>
                            </div>
                        </div>
                        <div className="text-zinc-300 text-sm flex flex-wrap items-center gap-1">
                            {msg.fragments?.map((frag, i) => (
                                frag.type === 'text' ? (
                                    <span key={i}>{frag.content}</span>
                                ) : (
                                    <span key={i} className="h-5 w-5 relative inline-block align-middle select-none">
                                        <Image src={frag.url} alt={frag.name} fill unoptimized />
                                    </span>
                                )
                            ))}
                        </div>
                    </div>
                ))}
                {history.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-zinc-500 italic text-sm opacity-50">
                        No history yet.
                    </div>
                )}
            </div>
        </div>
    );
}
