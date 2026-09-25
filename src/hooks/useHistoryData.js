'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { computeExpiresAt } from '@/lib/activeMessage';

// Extracted verbatim from the original inline logic in components/dashboard/History.js.
export function useHistoryData({ targetUid, userRole }) {
    const { user } = useAuth();
    const effectiveUid = targetUid || user?.id;
    const [history, setHistory] = useState([]);
    const [activeMessage, setActiveMessage] = useState(null);
    const [displayDuration, setDisplayDuration] = useState(5);

    useEffect(() => {
        if (!effectiveUid || !supabase) return;

        const mapRow = (row) => ({ id: row.id, ...row.payload, twitchMessageId: row.twitch_message_id, login: row.login, timestamp: row.timestamp });

        supabase.from('history').select('*').eq('user_id', effectiveUid)
            .order('timestamp', { ascending: false }).limit(50)
            .then(({ data }) => setHistory((data || []).map(mapRow)));

        // Live, not one-time: another dashboard session (a mod on a second
        // device, or the pg_cron/trigger-driven queue promotion) can add to
        // history while this tab is open.
        const channel = supabase
            .channel(`history-data-${effectiveUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'history', filter: `user_id=eq.${effectiveUid}` }, (payload) => {
                setHistory((prev) => {
                    if (payload.eventType === 'DELETE') return prev.filter(h => h.id !== payload.old.id);
                    if (payload.eventType === 'INSERT') return [mapRow(payload.new), ...prev].slice(0, 50);
                    return prev.map(h => h.id === payload.new.id ? mapRow(payload.new) : h);
                });
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [effectiveUid]);

    useEffect(() => {
        if (!effectiveUid || !supabase) return;
        const applyActiveMessage = (row) => {
            setActiveMessage(row ? { ...row.payload, __expiresAt: row.expires_at } : null);
        };
        supabase.from('active_message').select('*').eq('user_id', effectiveUid).maybeSingle()
            .then(({ data }) => applyActiveMessage(data));
        const channel = supabase
            .channel(`history-data-active-message-${effectiveUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'active_message', filter: `user_id=eq.${effectiveUid}` }, (payload) => {
                applyActiveMessage(payload.eventType === 'DELETE' ? null : payload.new);
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [effectiveUid]);

    // Needed so resendToScreen below can compute a real expires_at instead
    // of falling back to computeExpiresAt's hardcoded default.
    useEffect(() => {
        if (!effectiveUid || !supabase) return;
        supabase.from('settings').select('display_duration').eq('user_id', effectiveUid).maybeSingle()
            .then(({ data }) => { if (typeof data?.display_duration === 'number') setDisplayDuration(data.display_duration); });
        const channel = supabase
            .channel(`history-data-settings-${effectiveUid}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${effectiveUid}` }, (payload) => {
                if (payload.eventType !== 'DELETE' && typeof payload.new?.display_duration === 'number') setDisplayDuration(payload.new.display_duration);
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [effectiveUid]);

    const hideOverlay = async () => {
        if (!effectiveUid || !supabase) return;
        try {
            await supabase.from('active_message').delete().eq('user_id', effectiveUid);
        } catch (e) { console.error("Error hiding:", e); }
    };

    const resendToScreen = async (msg, permanent = false) => {
        if (!user || !supabase || userRole === 'denied') return;

        const isViewer = userRole === 'viewer';
        const payload = {
            username: msg.username, login: msg.login, avatarUrl: msg.avatarUrl, color: msg.color, fragments: msg.fragments,
            suggestedBy: user.id,
            suggestedByName: user.user_metadata?.name,
            fromHistory: true,
            twitchMessageId: msg.twitchMessageId || null,
        };

        try {
            if (isViewer) {
                await supabase.from('suggestions').insert({
                    user_id: effectiveUid,
                    submitted_by: user.id,
                    payload,
                });
                console.log('History Suggestion Sent ✅');
            } else {
                await supabase.from('active_message').upsert({
                    user_id: effectiveUid,
                    payload,
                    expires_at: computeExpiresAt(displayDuration, permanent),
                }, { onConflict: 'user_id' });
                console.log('History Sent to Screen ✅');
            }
        } catch (e) { console.error(e); }
    };

    const clearHistory = async () => {
        if (!effectiveUid || !supabase || (userRole !== 'broadcaster' && userRole !== 'mod')) return;
        try {
            await supabase.from('history').delete().eq('user_id', effectiveUid);
            setHistory([]);
        } catch (e) { console.error("Error clearing history:", e); }
    };

    return { effectiveUid, history, activeMessage, hideOverlay, resendToScreen, clearHistory };
}
