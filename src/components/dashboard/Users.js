'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
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
import { Users as UsersIcon } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import UserCard from '@/components/dashboard/UserCard';

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
                    <UserCard
                        key={u.id}
                        displayName={u.displayName}
                        twitchUsername={u.twitchUsername}
                        photoURL={u.photoURL}
                        role={u.role}
                        online={u.isOnline}
                        lastSeen={u.lastSeen ? new Date(u.lastSeen.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null}
                        onRoleChange={(role) => setRole(u.id, role)}
                        onReset={() => removePermission(u.id)}
                    />
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
