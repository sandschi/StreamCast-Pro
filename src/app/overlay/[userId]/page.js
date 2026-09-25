'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { AnimatePresence } from 'framer-motion';
import { useParams } from 'next/navigation';
import MessageBubble from '@/components/overlay/MessageBubble';
import QueueCard from '@/components/overlay/QueueCard';
import NowPlayingCard from '@/components/overlay/NowPlayingCard';

const SOUNDS = {
    pop: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    ding: 'https://assets.mixkit.co/active_storage/sfx/2860/2860-preview.mp3',
    coin: 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3',
    notify: 'https://assets.mixkit.co/active_storage/sfx/1124/1124-preview.mp3',
    success: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
    chime: 'https://assets.mixkit.co/active_storage/sfx/2857/2857-preview.mp3',
    bloop: 'https://assets.mixkit.co/active_storage/sfx/2863/2863-preview.mp3',
    click: 'https://assets.mixkit.co/active_storage/sfx/2847/2847-preview.mp3',
    tone: 'https://assets.mixkit.co/active_storage/sfx/2861/2861-preview.mp3',
    note: 'https://assets.mixkit.co/active_storage/sfx/2858/2858-preview.mp3',
};

export default function OverlayPage() {
    const { userId } = useParams();
    const [activeMessage, setActiveMessage] = useState(null);

    // KaraFun State
    const [karafunQueue, setKarafunQueue] = useState([]);
    const [karafunNowPlaying, setKarafunNowPlaying] = useState(null);
    const [karafunPlayState, setKarafunPlayState] = useState('stop');
    // Mirrors relay/src/karafunConnection.js's own `connected` flag - the
    // relay keeps the last-known queue/song in karafun_state across a socket
    // drop (so a brief blip doesn't blank the overlay), but that means this
    // page must check connectivity itself before rendering stale data during
    // a real outage, rather than trusting queue/song presence alone.
    const [karafunConnected, setKarafunConnected] = useState(false);
    const [showNowPlaying, setShowNowPlaying] = useState(false);
    // Track the last song title+state that triggered the popup so we only fire on genuine song starts
    const lastTriggeredSongRef = useRef(null);
    const lastPlayStateRef = useRef(null);
    const lastManualTriggerRef = useRef(0); // Store timestamp of last manual trigger
    const hideTimerRef = useRef(null); // Consolidated Ref for auto-hiding the "Now Playing" popup

    const [settings, setSettings] = useState({
        textColor: '#ffffff',
        strokeColor: '#000000',
        fontSize: 24,
        nameSize: 16,
        avatarSize: 40,
        fontFamily: 'Inter',
        animationStyle: 'slide',
        displayDuration: 5,
        borderRadius: 12,
        posX: 5,
        posY: 90,
        showAvatar: true,
        bubbleStyle: 'classic', // classic, glass, neon, minimal, bold
        soundEnabled: false,
        soundType: 'pop',
        soundVolume: 0.5,
    });

    // Merge global settings with per-message overrides (for testing/preview)
    const effectiveSettings = useMemo(() => {
        return activeMessage?.settings ? { ...settings, ...activeMessage.settings } : settings;
    }, [settings, activeMessage]);

    // 1. Dynamic Font Loading
    useEffect(() => {
        if (!effectiveSettings.fontFamily) return;
        const link = document.createElement('link');

        // Some fonts like Monoton only have weight 400, so we use a more flexible approach
        const fontName = effectiveSettings.fontFamily.replace(/\s+/g, '+');
        // Request multiple weights but Google Fonts will only load what's available
        link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@400;700;900&display=swap`;
        link.rel = 'stylesheet';

        // Add error handling to prevent font loading from breaking the overlay
        link.onerror = () => {
            console.warn(`Failed to load font: ${effectiveSettings.fontFamily}, falling back to system fonts`);
        };

        document.head.appendChild(link);
        return () => { try { document.head.removeChild(link); } catch (e) { } };
    }, [effectiveSettings.fontFamily]);

    // KaraFun Dynamic Font Loading
    useEffect(() => {
        if (!settings.karafunFontFamily) return;
        const link = document.createElement('link');
        const fontName = settings.karafunFontFamily.replace(/\s+/g, '+');
        link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@400;700;900&display=swap`;
        link.rel = 'stylesheet';
        link.onerror = () => { console.warn(`Failed to load font: ${settings.karafunFontFamily}`); };
        document.head.appendChild(link);
        return () => { try { document.head.removeChild(link); } catch (e) { } };
    }, [settings.karafunFontFamily]);

    // settings + active_message: both public/anon-readable (RLS), streamed
    // via Realtime postgres_changes. Realtime has no initial-snapshot replay
    // the way onSnapshot gave for free, so each is fetched once up front
    // before subscribing to further changes - same "catch-up query" pattern
    // the relay needs (plan §5).
    useEffect(() => {
        if (!supabase || !userId) return;
        let cancelled = false;

        // cosmetic settings live in the appearance JSONB blob; karafun_enabled
        // and display_duration are first-class columns (RLS/column-grant
        // reasons - see supabase/schema/0001_schema.sql) so they're merged in
        // under the same camelCase names the rest of this page expects.
        const applySettings = (row) => {
            if (!row) return;
            setSettings(prev => ({
                ...prev,
                ...(row.appearance || {}),
                karafunEnabled: row.karafun_enabled,
                displayDuration: row.display_duration,
            }));
        };

        // Mirrors active_message/current directly: any change (a new Send, a
        // queued message getting promoted, a delete) replaces or clears what's
        // showing immediately. There is deliberately no local queueing here -
        // the overlay has no write access (it's unauthenticated by design), so
        // it can't own queue state; that lives in useChatData.js on the
        // dashboard side, which is the only client that can advance it.
        const applyActiveMessage = (row) => {
            if (!row || !row.payload || Object.keys(row.payload).length === 0) {
                setActiveMessage(null);
                return;
            }
            // expires_at is computed server-side at write time (NULL =
            // permanent) - the authoritative expiry, replacing the old
            // Firestore doc's client-trusted `duration` field entirely.
            setActiveMessage({ ...row.payload, id: row.payload.id || row.created_at, __expiresAt: row.expires_at });
        };

        Promise.all([
            supabase.from('settings').select('*').eq('user_id', userId).maybeSingle(),
            supabase.from('active_message').select('*').eq('user_id', userId).maybeSingle(),
        ]).then(([{ data: settingsRow }, { data: activeMsgRow }]) => {
            if (cancelled) return;
            applySettings(settingsRow);
            applyActiveMessage(activeMsgRow);
        });

        const channel = supabase
            .channel(`overlay-core-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `user_id=eq.${userId}` },
                (payload) => applySettings(payload.eventType === 'DELETE' ? null : payload.new))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'active_message', filter: `user_id=eq.${userId}` },
                (payload) => applyActiveMessage(payload.eventType === 'DELETE' ? null : payload.new))
            .subscribe();

        return () => { cancelled = true; supabase.removeChannel(channel); };
    }, [userId]);

    // Listen for manual "show now playing" triggers written via the API
    useEffect(() => {
        if (!supabase || !userId) return;
        let cancelled = false;

        const applyTrigger = (row, { isInitial }) => {
            if (row?.now_playing_triggered_at) {
                const triggerTime = new Date(row.now_playing_triggered_at).getTime();

                // Only replay this specific trigger once.
                if (triggerTime > lastManualTriggerRef.current) {
                    lastManualTriggerRef.current = triggerTime;

                    // Only guard against staleness on the initial fetch (a
                    // leftover trigger from a previous session). The dashboard
                    // and the overlay can run on different machines with
                    // skewed clocks, so a live Realtime event always shows
                    // immediately - it's never rejected as "stale".
                    if (isInitial && (Date.now() - triggerTime) > 10000) {
                        console.log('[Trigger] Ignoring stale manual trigger on page load');
                    } else {
                        setTimeout(() => setShowNowPlaying(true), 0);
                        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
                        hideTimerRef.current = setTimeout(() => setShowNowPlaying(false), 10000);
                    }
                }
            } else {
                if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
                setShowNowPlaying(false);
            }
        };

        supabase.from('overlay_triggers').select('*').eq('user_id', userId).maybeSingle()
            .then(({ data }) => { if (!cancelled) applyTrigger(data, { isInitial: true }); });

        const channel = supabase
            .channel(`overlay-trigger-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'overlay_triggers', filter: `user_id=eq.${userId}` },
                (payload) => applyTrigger(payload.eventType === 'DELETE' ? null : payload.new, { isInitial: false }))
            .subscribe();

        return () => {
            cancelled = true;
            supabase.removeChannel(channel);
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        };
    }, [userId]);

    // Local, cosmetic-only auto-hide: stop rendering the active message once
    // its server-computed expires_at has passed. This does NOT touch the
    // database (the overlay can't - see above), so it's a visual safety net
    // that works even if the dashboard that sent this message is closed; the
    // dashboard's pg_cron job separately deletes the row itself once expired,
    // which is what actually advances the queue for the next viewer/session.
    useEffect(() => {
        if (!activeMessage) return;
        if (!activeMessage.__expiresAt) return; // NULL expires_at means "permanent"
        const msLeft = new Date(activeMessage.__expiresAt).getTime() - Date.now();
        const timer = setTimeout(() => setActiveMessage(null), Math.max(msLeft, 0) + 500);
        return () => clearTimeout(timer);
    }, [activeMessage]);

    // Play the notification sound whenever a new message appears.
    useEffect(() => {
        if (!activeMessage || !settings.soundEnabled) return;
        try {
            const audio = new Audio(SOUNDS[settings.soundType || 'pop']);
            audio.volume = settings.soundVolume !== undefined ? settings.soundVolume : 0.5;
            audio.play().catch(e => console.warn('Audio play failed:', e));
        } catch (e) {
            console.error("Sound Error:", e);
        }
    }, [activeMessage, settings.soundEnabled, settings.soundType, settings.soundVolume]);

    // 4. KaraFun Integration - reads karafun_state, mirrored by relay/ (the
    // one process that still holds a real KaraFun socket) instead of opening
    // its own connection. This overlay used to dial KaraFun directly with its
    // own public, unauthenticated socket - see docs/karafun-relay-design.md
    // §0/§2/§7 for why that's gone: it was one of up to three simultaneous
    // direct sockets per broadcaster (alongside every verified dashboard
    // session), and the KaraFun party ID this unauthenticated page can't read
    // anyway - it doesn't need to anymore.
    useEffect(() => {
        if (!supabase || !userId || !settings.karafunEnabled || (!settings.karafunOverlayQueueEnabled && !settings.karafunOverlayNowPlayingEnabled)) {
            return;
        }

        const applyState = (row) => {
            if (!row) {
                setKarafunQueue([]);
                setKarafunNowPlaying(null);
                setKarafunPlayState('stop');
                setKarafunConnected(false);
                return;
            }
            // Idle/infoscreen/stop ambiguity is already resolved by the relay
            // before it writes this row (see karafunConnection.js's own
            // 'status' handler) - current_song here is only ever a real song
            // or null, nothing left to re-derive client-side.
            const transformed = (row.upcoming || []).map((item, idx) => ({
                id: item.queueId || `${item.title}-${item.artist}-${idx}`,
                title: item.title || 'Unknown',
                artist: item.artist || '',
                singer: item.singer || '',
            })).slice(0, 5); // next 5 songs only
            setKarafunQueue(transformed);
            setKarafunNowPlaying(row.current_song || null);
            setKarafunPlayState(row.play_state || 'stop');
            setKarafunConnected(!!row.connected);
        };

        let cancelled = false;
        supabase.from('karafun_state').select('*').eq('user_id', userId).maybeSingle()
            .then(({ data }) => { if (!cancelled) applyState(data); });

        const channel = supabase
            .channel(`overlay-karafun-${userId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'karafun_state', filter: `user_id=eq.${userId}` },
                (payload) => applyState(payload.eventType === 'DELETE' ? null : payload.new))
            .subscribe();

        return () => { cancelled = true; supabase.removeChannel(channel); };
    }, [userId, settings.karafunEnabled, settings.karafunOverlayQueueEnabled, settings.karafunOverlayNowPlayingEnabled]);

    // Trigger Now Playing animation ONLY when a genuinely new song starts playing.
    useEffect(() => {
        if (!settings.karafunOverlayNowPlayingEnabled) return;

        const songKey = karafunNowPlaying ? `${karafunNowPlaying.title}-${karafunNowPlaying.artist}`.trim().toLowerCase() : '';
        const isPlaying = karafunPlayState === 'playing';
        const prevWasPlaying = lastPlayStateRef.current === 'playing';

        // Update play state ref immediately to track transitions correctly in the next run
        lastPlayStateRef.current = karafunPlayState;

        // 1. If playback stops or nothing is playing, hide immediately
        if (!isPlaying || !karafunNowPlaying) {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
            hideTimerRef.current = setTimeout(() => setShowNowPlaying(false), 0);
            return;
        }

        // 2. Trigger on:
        // - Title/Artist change while playing
        // - Playback RESUMED from a non-playing state (stop/infoscreen)
        const hasSongChanged = songKey !== lastTriggeredSongRef.current;
        const hasBecomePlaying = isPlaying && !prevWasPlaying;

        if (hasSongChanged || hasBecomePlaying) {
            console.log(`[NowPlaying] Triggered: ${songKey} (Changed: ${hasSongChanged}, Resumed: ${hasBecomePlaying})`);
            lastTriggeredSongRef.current = songKey;

            // Clear any existing hide timer
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

            // Pop showing with a small delay to avoid cascading render lint error
            const timer = setTimeout(() => setShowNowPlaying(true), 0);

            // Arm the shared hide timer
            hideTimerRef.current = setTimeout(() => {
                setShowNowPlaying(false);
            }, 5000);
        }
    }, [karafunNowPlaying, karafunPlayState, settings.karafunOverlayNowPlayingEnabled, hideTimerRef]);

    return (
        <div
            className="w-screen h-screen bg-transparent overflow-hidden relative"
            style={{ fontFamily: `'${effectiveSettings.fontFamily}', sans-serif` }}
        >
            <AnimatePresence mode="wait">
                {activeMessage && (
                    <MessageBubble key={activeMessage.id} message={activeMessage} settings={effectiveSettings} />
                )}
            </AnimatePresence>

            {/* KaraFun Overlays - gated on karafunEnabled too, not just the two
                overlay-widget toggles below: the mirror effect's early return
                (karafunEnabled off) leaves karafunQueue/karafunNowPlaying in
                whatever state they were last in rather than clearing them, so
                without this the last queue/Now Playing card would stay
                visible on stream after the broadcaster disables KaraFun. */}
            <AnimatePresence>
                {settings.karafunEnabled && karafunConnected && settings.karafunOverlayQueueEnabled && karafunQueue.length > 0 && (
                    <QueueCard queue={karafunQueue} settings={settings} />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {settings.karafunEnabled && karafunConnected && settings.karafunOverlayNowPlayingEnabled && showNowPlaying && karafunNowPlaying && (
                    <NowPlayingCard song={karafunNowPlaying} settings={settings} />
                )}
            </AnimatePresence>
        </div>
    );
}
