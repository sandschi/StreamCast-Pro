'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, query, where } from 'firebase/firestore';
import { Users, CheckCircle, XCircle, Clock, ShieldCheck } from 'lucide-react';

export default function Broadcasters() {
    const [broadcasters, setBroadcasters] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Query all users who have a twitchUsername (indicating they are broadcasters)
        const usersRef = collection(db, 'users');
        const unsubscribe = onSnapshot(usersRef, (snapshot) => {
            const list = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(u => u.twitchUsername); // Only show those who signed in as broadcasters
            setBroadcasters(list);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const setStatus = async (userId, status) => {
        try {
            await updateDoc(doc(db, 'users', userId), { status });
        } catch (e) {
            console.error('Failed to update status:', e);
        }
    };

    if (loading) return (
        <div className="flex items-center justify-center p-20 text-zinc-500">
            <Clock className="animate-spin mr-2" /> Loading users...
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600/20 rounded-lg text-indigo-400">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Broadcaster Management</h2>
                        <p className="text-sm text-zinc-500 text-[10px] uppercase tracking-widest font-bold">Master Admin View</p>
                    </div>
                </div>
                <div className="text-right">
                    <span className="text-2xl font-black text-white">{broadcasters.length}</span>
                    <p className="text-[10px] text-zinc-500 uppercase font-black">Registered</p>
                </div>
            </div>

            <div className="grid gap-4">
                {broadcasters.map((u) => (
                    <div key={u.id} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between group hover:border-zinc-700 transition-all">
                        <div className="flex items-center gap-4">
                            <img src={u.photoURL} alt="" className="w-12 h-12 rounded-full border-2 border-zinc-800 shadow-xl" />
                            <div>
                                <p className="font-bold text-zinc-100 flex items-center gap-2">
                                    {u.displayName}
                                    {u.status === 'approved' && <CheckCircle size={14} className="text-green-500" />}
                                    {u.status === 'denied' && <XCircle size={14} className="text-red-500" />}
                                    {u.status === 'waiting' && <Clock size={14} className="text-yellow-500" />}
                                </p>
                                <p className="text-xs text-zinc-500">@{u.twitchUsername}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setStatus(u.id, 'approved')}
                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-tighter transition-all flex items-center gap-2 ${u.status === 'approved'
                                        ? 'bg-green-600 text-white shadow-lg shadow-green-900/20'
                                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                    }`}
                            >
                                <CheckCircle size={14} /> Approve
                            </button>

                            <button
                                onClick={() => setStatus(u.id, 'denied')}
                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-tighter transition-all flex items-center gap-2 ${u.status === 'denied'
                                        ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                    }`}
                            >
                                <XCircle size={14} /> Deny
                            </button>

                            <button
                                onClick={() => setStatus(u.id, 'waiting')}
                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-tighter transition-all flex items-center gap-2 ${u.status === 'waiting'
                                        ? 'bg-yellow-600 text-white shadow-lg shadow-yellow-900/20'
                                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                    }`}
                            >
                                <Clock size={14} /> Waiting
                            </button>
                        </div>
                    </div>
                ))}

                {broadcasters.length === 0 && (
                    <div className="text-center py-20 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800">
                        <Users className="mx-auto text-zinc-700 mb-4" size={48} />
                        <p className="text-zinc-500">No broadcasters found in the system.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
