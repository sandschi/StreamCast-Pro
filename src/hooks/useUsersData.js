'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

// Extracted verbatim from the original inline logic in components/dashboard/Users.js.
export function useUsersData({ targetUid, user }) {
    const [presence, setPresence] = useState([]);
    const [permissions, setPermissions] = useState({});
    const effectiveUid = targetUid || user?.uid;

    useEffect(() => {
        if (!effectiveUid) return;

        const presenceRef = collection(db, 'users', effectiveUid, 'online');
        const unsubPresence = onSnapshot(presenceRef, (snapshot) => {
            const users = [];
            snapshot.forEach((doc) => {
                users.push({ id: doc.id, ...doc.data() });
            });
            setPresence(users);
        });

        const permissionsRef = collection(db, 'users', effectiveUid, 'permissions');
        const unsubPermissions = onSnapshot(permissionsRef, (snapshot) => {
            const perms = {};
            snapshot.forEach((doc) => {
                perms[doc.id] = doc.data();
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
            const pData = presence.find(p => p.id === userId);
            const existingPerm = permissions[userId] || {};
            const roleRef = doc(db, 'users', effectiveUid, 'permissions', userId);

            await setDoc(roleRef, {
                role,
                updatedAt: serverTimestamp(),
                updatedBy: user.uid,
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

    const allUserIds = Array.from(new Set([...presence.map(p => p.id), ...Object.keys(permissions)]));
    const userList = allUserIds.map(id => {
        const pData = presence.find(p => p.id === id);
        const permData = permissions[id];
        return {
            id,
            displayName: pData?.displayName || permData?.displayName || id,
            twitchUsername: pData?.twitchUsername || permData?.twitchUsername || null,
            photoURL: pData?.photoURL || permData?.photoURL || null,
            role: permData?.role || 'viewer',
            isOnline: !!pData,
            lastSeen: pData?.lastSeen
        };
    }).filter(u => u.id !== effectiveUid);

    return { effectiveUid, userList, setRole, removePermission };
}
