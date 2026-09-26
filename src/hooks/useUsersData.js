'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Extracted verbatim from the original inline logic in components/dashboard/Users.js.
export function useUsersData({ targetUid, user }) {
    const [presence, setPresence] = useState([]);
    const [permissions, setPermissions] = useState({});
    const effectiveUid = targetUid || user?.id;

    useEffect(() => {
        if (!effectiveUid || !supabase) return;

        const mapPresenceRow = (row) => ({
            id: row.viewer_id, displayName: row.display_name, photoURL: row.photo_url,
            twitchUsername: row.twitch_username, lastSeen: row.last_seen,
        });

        supabase.from('online').select('*').eq('user_id', effectiveUid)
            .then(({ data }) => setPresence((data || []).map(mapPresenceRow)));

        const presenceChannel = supabase
            .channel(`users-data-online-${effectiveUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'online', filter: `user_id=eq.${effectiveUid}` }, (payload) => {
                setPresence((prev) => {
                    if (payload.eventType === 'DELETE') return prev.filter(p => p.id !== payload.old.viewer_id);
                    const row = mapPresenceRow(payload.new);
                    const idx = prev.findIndex(p => p.id === row.id);
                    if (idx === -1) return [...prev, row];
                    const next = [...prev];
                    next[idx] = row;
                    return next;
                });
            })
            .subscribe();

        supabase.from('permissions').select('*').eq('user_id', effectiveUid)
            .then(({ data }) => {
                const perms = {};
                (data || []).forEach(row => { perms[row.viewer_id] = row; });
                setPermissions(perms);
            });

        const permissionsChannel = supabase
            .channel(`users-data-permissions-${effectiveUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'permissions', filter: `user_id=eq.${effectiveUid}` }, (payload) => {
                setPermissions((prev) => {
                    if (payload.eventType === 'DELETE') {
                        const next = { ...prev };
                        delete next[payload.old.viewer_id];
                        return next;
                    }
                    return { ...prev, [payload.new.viewer_id]: payload.new };
                });
            })
            .subscribe();

        return () => { supabase.removeChannel(presenceChannel); supabase.removeChannel(permissionsChannel); };
    }, [effectiveUid]);

    const setRole = async (userId, role) => {
        try {
            const pData = presence.find(p => p.id === userId);
            const existingPerm = permissions[userId] || {};
            await supabase.from('permissions').upsert({
                user_id: effectiveUid,
                viewer_id: userId,
                role,
                display_name: pData?.displayName || existingPerm.display_name || userId,
                photo_url: pData?.photoURL || existingPerm.photo_url || null,
                twitch_username: pData?.twitchUsername || existingPerm.twitch_username || null,
            }, { onConflict: 'user_id,viewer_id' });
        } catch (e) {
            console.error('Failed to set role:', e);
        }
    };

    const removePermission = async (userId) => {
        try {
            await supabase.from('permissions').delete().eq('user_id', effectiveUid).eq('viewer_id', userId);
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
            displayName: pData?.displayName || permData?.display_name || id,
            twitchUsername: pData?.twitchUsername || permData?.twitch_username || null,
            photoURL: pData?.photoURL || permData?.photo_url || null,
            role: permData?.role || 'viewer',
            isOnline: !!pData,
            lastSeen: pData?.lastSeen
        };
    }).filter(u => u.id !== effectiveUid);

    return { effectiveUid, userList, setRole, removePermission };
}
