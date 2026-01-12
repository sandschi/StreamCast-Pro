'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc } from 'firebase/firestore';
import { History as HistoryIcon, RefreshCw } from 'lucide-react';

export default function History({ targetUid, isModeratorMode, isModAuthorized }) {
    const { user } = useAuth();
    const effectiveUid = targetUid || user?.uid;
    const [history, setHistory] = useState([]);

    useEffect(() => {
        if (!user) return;

        const q = query(
            collection(db, 'users', effectiveUid, 'history'),
            orderBy('timestamp', 'desc'),
            limit(20)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setHistory(docs);
        });

        return () => unsubscribe();
    }, [user, effectiveUid]);

    const resendToScreen = async (msg) => {
        if (!user || (isModeratorMode && !isModAuthorized)) return;
        const activeMsgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
        await setDoc(activeMsgRef, {
            ...msg,
            timestamp: new Date(), // Local update for instant feel
        });
    };

    return (
        <div className="flex flex-col h-[600px] bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
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
                            <button
                                onClick={() => resendToScreen(msg)}
                                className="p-1 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white transition-colors"
                                title="Quick Re-send"
                            >
                                <RefreshCw size={14} />
                            </button>
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
