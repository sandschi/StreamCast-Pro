'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import posthog from 'posthog-js';

// BroadcastersPane.js reads the classic Firestore-shaped camelCase fields
// (twitchUsername/displayName/photoURL) - map the raw snake_case row once
// here rather than touching that component.
const mapBroadcasterRow = (row) => ({
    id: row.id,
    twitchUsername: row.twitch_username,
    displayName: row.display_name,
    photoURL: row.photo_url,
    status: row.status,
    lastLogin: row.last_login,
    createdAt: row.created_at,
});

// Extracted verbatim from the original inline logic in components/dashboard/Broadcasters.js.
export function useBroadcastersData() {
    const [broadcasters, setBroadcasters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [testingWebhook, setTestingWebhook] = useState(false);

    useEffect(() => {
        if (!supabase) return;

        const load = async () => {
            const { data, error: fetchError } = await supabase.from('users').select('*');
            if (fetchError) {
                console.error('Failed to load broadcasters:', fetchError);
                setError(fetchError.message || 'Failed to load broadcasters.');
                setLoading(false);
                return;
            }
            setBroadcasters((data || []).filter(u => u.twitch_username).map(mapBroadcasterRow));
            setError(null);
            setLoading(false);
        };
        load();

        // RLS only lets this table-wide (no filter) subscription see every
        // row for the master admin - see users_select in
        // supabase/schema/0002_rls.sql - which is who this pane is gated to.
        const channel = supabase
            .channel('broadcasters-data-users')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, (payload) => {
                setBroadcasters((prev) => {
                    if (payload.eventType === 'DELETE') return prev.filter(u => u.id !== payload.old.id);
                    if (!payload.new.twitch_username) return prev.filter(u => u.id !== payload.new.id);
                    const row = mapBroadcasterRow(payload.new);
                    const idx = prev.findIndex(u => u.id === row.id);
                    if (idx === -1) return [...prev, row];
                    const next = [...prev];
                    next[idx] = row;
                    return next;
                });
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, []);

    // Plain update() had no protection against two admin sessions (two tabs,
    // two devices) racing on the same broadcaster's status - whichever write
    // landed last silently won. expectedCurrentStatus is whatever this
    // session's own snapshot last saw for this broadcaster; a conditional
    // update (WHERE status = expected) is Postgres's equivalent of Firestore's
    // transaction re-read - it just affects zero rows instead of overwriting
    // if that's gone stale, rather than trusting a value that might be
    // seconds or minutes old.
    const setStatus = async (userId, status, expectedCurrentStatus) => {
        try {
            let query = supabase.from('users').update({ status }).eq('id', userId);
            if (expectedCurrentStatus !== undefined) query = query.eq('status', expectedCurrentStatus);
            const { data, error: updateError } = await query.select('status');
            if (updateError) throw updateError;
            if (expectedCurrentStatus !== undefined && (!data || data.length === 0)) {
                throw new Error("This broadcaster's status changed since your list last updated — refresh and try again.");
            }
            // Re-clicking Approve on an already-approved broadcaster shouldn't
            // fire the event again - only a real transition is worth counting.
            const statusActuallyChanged = expectedCurrentStatus === undefined || expectedCurrentStatus !== status;
            if (statusActuallyChanged) {
                if (status === 'approved') posthog.capture('broadcaster_approved', { userId });
                else if (status === 'denied') posthog.capture('broadcaster_denied', { userId });
            }
        } catch (e) {
            console.error('Failed to update status:', e);
            alert(e.message || 'Failed to update status.');
        }
    };

    const testWebhook = async () => {
        setTestingWebhook(true);
        try {
            const response = await fetch('/api/notify-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: 'test-webhook-' + Date.now(),
                    userData: {
                        twitchUsername: 'test_user',
                        displayName: 'Test User',
                        photoURL: 'https://static-cdn.jtvnw.net/user-default-pictures-uv/cdd517fe-def4-11e9-948e-784f43822e80-profile_image-300x300.png',
                        status: 'waiting',
                        lastLogin: new Date().toISOString()
                    }
                })
            });

            if (response.ok) {
                alert('✅ Test notification sent to Discord!');
            } else {
                alert('❌ Failed to send test notification. Check console for details.');
            }
        } catch (error) {
            console.error('Test webhook error:', error);
            alert('❌ Error sending test notification: ' + error.message);
        } finally {
            setTestingWebhook(false);
        }
    };

    return { broadcasters, loading, error, testingWebhook, setStatus, testWebhook };
}
