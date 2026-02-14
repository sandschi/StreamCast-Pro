'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc } from 'firebase/firestore';
// NEW: Icons for Suggestion
import { History as HistoryIcon, RefreshCw, Send, ScreenShare } from 'lucide-react';
import { addDoc, serverTimestamp } from 'firebase/firestore';

export default function History({ targetUid, isModeratorMode, isModAuthorized, userRole }) {
    const { user } = useAuth();
    const effectiveUid = targetUid || user?.uid;
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
            await setDoc(doc(db, 'users', effectiveUid, 'active_message', 'current'), {});
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
                        className="flex items-center gap-2 px-4 py-2 bg-red-500/90 hover:bg-red-500 text-white rounded-full text-xs font-bold transition-all shadow-xl animate-in fade-in slide-in-from-top-4"
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

            <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-hide">
                {history.map((msg) => (
                    <div key={msg.id} className="group flex flex-col gap-1 bg-zinc-800/20 p-3 rounded-lg border border-zinc-800/50 hover:bg-zinc-800/40 transition-all">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                {msg.avatarUrl && (
                                    <img src={msg.avatarUrl} alt="" className="w-4 h-4 rounded-full border border-white/10" />
                                )}
                                <span className="font-bold text-xs" style={{ color: msg.color }}>
                                    {msg.username}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                {(userRole === 'broadcaster' || userRole === 'mod') && (
                                    <button
                                        onClick={() => resendToScreen(msg, true)}
                                        className="p-1.5 rounded-lg text-white transition-all scale-90 hover:scale-100 shadow-lg bg-zinc-700 hover:bg-zinc-600 shadow-zinc-900/20"
                                        title="Show Permanently (∞)"
                                    >
                                        <span className="text-[10px] font-bold">∞</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => resendToScreen(msg)}
                                    className={`p-1.5 rounded-lg transition-all flex items-center gap-1.5 px-3 border ${userRole === 'viewer'
                                        ? 'bg-indigo-600/10 text-indigo-400 border-indigo-500/20 hover:bg-indigo-600/20'
                                        : 'bg-purple-600/10 text-purple-400 border-purple-500/20 hover:bg-purple-600/20 text-white'
                                        }`}
                                    title={userRole === 'viewer' ? "Suggest Message" : "Show on Overlay"}
                                >
                                    {userRole === 'viewer' ? <Send size={12} /> : <ScreenShare size={12} />}
                                    <span className="text-[10px] font-bold uppercase tracking-wider">
                                        {userRole === 'viewer' ? 'Suggest' : 'Show'}
                                    </span>
                                </button>
                            </div>
                        </div>
                        <div className="text-zinc-300 text-sm flex flex-wrap items-center gap-1">
                            {msg.fragments?.map((frag, i) => (
                                frag.type === 'text' ? (
                                    <span key={i}>{frag.content}</span>
                                ) : (
                                    <img key={i} src={frag.url} alt={frag.name} className="h-5 inline-block" />
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
