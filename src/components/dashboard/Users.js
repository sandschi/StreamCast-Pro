'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Avatar from '@/components/ui/Avatar';
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
import RoleSwitch from '@/components/ui/RoleSwitch';
import EmptyState from '@/components/ui/EmptyState';

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
                perms[doc.id] = doc.data(); // Store full data, not just role
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
            // Find existing data from presence to persist
            const pData = presence.find(p => p.id === userId);
            const existingPerm = permissions[userId] || {};
            const roleRef = doc(db, 'users', effectiveUid, 'permissions', userId);

            await setDoc(roleRef, {
                role,
                updatedAt: serverTimestamp(),
                updatedBy: user.uid,
                // Persist readable names so they show up while offline
                displayName: pData?.displayName || existingPerm.displayName || userId,
                photoURL: pData?.photoURL || existingPerm.photoURL || null,
                twitchUsername: pData?.twitchUsername || existingPerm.twitchUsername || null
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
        const permData = permissions[id]; // This now contains full data including role
        return {
            id,
            displayName: pData?.displayName || permData?.displayName || id,
            twitchUsername: pData?.twitchUsername || permData?.twitchUsername || null,
            photoURL: pData?.photoURL || permData?.photoURL || null,
            role: permData?.role || 'viewer',
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
                                <Avatar
                                    size={48}
                                    iconSize={20}
                                    photoURL={u.photoURL}
                                    username={u.twitchUsername}
                                    ringClassName="border-2 border-zinc-800 bg-zinc-800"
                                    online={u.isOnline}
                                />
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
                                        {u.role === 'mod' && <Shield size={10} className="text-primary-400" />}
                                        {u.role === 'viewer' && <User size={10} className="text-zinc-500" />}
                                        {u.role === 'denied' && <ShieldAlert size={10} className="text-red-400" />}
                                        <span className={u.role === 'mod' ? 'text-primary-400' : u.role === 'viewer' ? 'text-zinc-500' : u.role === 'denied' ? 'text-red-400' : ''}>
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

                        <RoleSwitch value={u.role} onChange={(role) => setRole(u.id, role)} />

                        {u.lastSeen && (
                            <div className="mt-4 flex items-center gap-1 text-[10px] text-zinc-600">
                                <Clock size={10} />
                                <span>Active {new Date(u.lastSeen.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        )}
                    </div>
                ))}

                {userList.length === 0 && (
                    <EmptyState
                        className="col-span-full"
                        icon={<UsersIcon size={32} />}
                        title="No users currently logged in."
                        hint="Share your moderator link to see users here."
                    />
                )}
            </div>
        </div>
    );
}
