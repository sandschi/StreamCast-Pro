'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
    collection,
    query,
    onSnapshot,
    doc,
    setDoc,
    deleteDoc,
    serverTimestamp
} from 'firebase/firestore';
import { Shield, User, ShieldAlert, Trash2, Clock, Users as UsersIcon } from 'lucide-react';

export default function Users({ targetUid, user }) {
    const [presence, setPresence] = useState([]);
    const [permissions, setPermissions] = useState({});
    const effectiveUid = targetUid || user?.uid;

    useEffect(() => {
        if (!effectiveUid) return;

        // Listen for online users
        const presenceRef = collection(db, 'users', effectiveUid, 'online');
        const unsubPresence = onSnapshot(presenceRef, (snapshot) => {
            const users = [];
            snapshot.forEach((doc) => {
                users.push({ id: doc.id, ...doc.data() });
            });
            setPresence(users);
        });

        // Listen for permissions
        const permissionsRef = collection(db, 'users', effectiveUid, 'permissions');
        const unsubPermissions = onSnapshot(permissionsRef, (snapshot) => {
            const perms = {};
            snapshot.forEach((doc) => {
                perms[doc.id] = doc.data().role;
            });
            setPermissions(perms);
        });

        return () => {
            unsubPresence();
            unsubPermissions();
        };
    }, [effectiveUid]);

    const setRole = async (userId, role) => {
        try {
            const roleRef = doc(db, 'users', effectiveUid, 'permissions', userId);
            await setDoc(roleRef, {
                role,
                updatedAt: serverTimestamp(),
                updatedBy: user.uid
            }, { merge: true });
        } catch (e) {
            console.error('Failed to set role:', e);
        }
    };

    const removePermission = async (userId) => {
        try {
            const roleRef = doc(db, 'users', effectiveUid, 'permissions', userId);
            await deleteDoc(roleRef);
        } catch (e) {
            console.error('Failed to remove permission:', e);
        }
    };

    // Combine presence and existing permissions
    const allUserIds = Array.from(new Set([...presence.map(p => p.id), ...Object.keys(permissions)]));
    const userList = allUserIds.map(id => {
        const pData = presence.find(p => p.id === id);
        return {
            id,
            displayName: pData?.displayName || id,
            twitchUsername: pData?.twitchUsername || null,
            photoURL: pData?.photoURL || `https://api.dicebear.com/7.x/identicon/svg?seed=${id}`,
            role: permissions[id] || 'viewer',
            isOnline: !!pData,
            lastSeen: pData?.lastSeen
        };
    }).filter(u => u.id !== effectiveUid); // Don't show the broadcaster themselves

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {userList.map((u) => (
                    <div key={u.id} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all group">
                        <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <img src={u.photoURL} alt="" className="w-12 h-12 rounded-full border-2 border-zinc-800 bg-zinc-800" />
                                    {u.isOnline && (
                                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-4 border-zinc-900 rounded-full" />
                                    )}
                                </div>
                                <div>
                                    <h4 className="font-bold text-zinc-100 truncate max-w-[120px]" title={u.displayName}>
                                        {u.displayName}
                                    </h4>
                                    {u.twitchUsername && (
                                        <div className="text-[10px] text-zinc-500 -mt-0.5 lowercase">
                                            @{u.twitchUsername}
                                        </div>
                                    )}
                                    <div className="flex items-center gap-1 mt-1 text-[10px] font-medium uppercase tracking-wider">
                                        {u.role === 'mod' && <Shield size={10} className="text-indigo-400" />}
                                        {u.role === 'viewer' && <User size={10} className="text-zinc-500" />}
                                        {u.role === 'denied' && <ShieldAlert size={10} className="text-red-400" />}
                                        <span className={u.role === 'mod' ? 'text-indigo-400' : u.role === 'viewer' ? 'text-zinc-500' : u.role === 'denied' ? 'text-red-400' : ''}>
                                            {u.role}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => removePermission(u.id)}
                                className="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                title="Reset Permission"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <button
                                onClick={() => setRole(u.id, 'viewer')}
                                className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase tracking-tighter transition-all border ${u.role === 'viewer' ? 'bg-zinc-100 text-zinc-900 border-zinc-100' : 'text-zinc-400 border-zinc-800 hover:border-zinc-600'}`}
                            >
                                Viewer
                            </button>
                            <button
                                onClick={() => setRole(u.id, 'mod')}
                                className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase tracking-tighter transition-all border ${u.role === 'mod' ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-600/20' : 'text-zinc-400 border-zinc-800 hover:border-indigo-500/50'}`}
                            >
                                Mod
                            </button>
                            <button
                                onClick={() => setRole(u.id, 'denied')}
                                className={`py-2 px-1 rounded-xl text-[10px] font-bold uppercase tracking-tighter transition-all border ${u.role === 'denied' ? 'bg-red-600 text-white border-red-600 shadow-lg shadow-red-600/20' : 'text-zinc-400 border-zinc-800 hover:border-red-500/50'}`}
                            >
                                Denied
                            </button>
                        </div>

                        {u.lastSeen && (
                            <div className="mt-4 flex items-center gap-1 text-[10px] text-zinc-600">
                                <Clock size={10} />
                                <span>Active {new Date(u.lastSeen.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        )}
                    </div>
                ))}

                {userList.length === 0 && (
                    <div className="col-span-full py-12 text-center bg-zinc-900/30 border border-dashed border-zinc-800 rounded-3xl">
                        <UsersIcon className="mx-auto text-zinc-700 mb-3" size={32} />
                        <p className="text-zinc-500">No users currently logged in.</p>
                        <p className="text-zinc-600 text-xs mt-1">Share your moderator link to see users here.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
