'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
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

    useEffect(() => {
        if (!userId) return;
        const settingsRef = doc(db, 'users', userId, 'settings', 'config');
        const unsubscribeSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setSettings(prev => ({ ...prev, ...doc.data() }));
        });

        // Directly mirror active_message/current: any change (a new Send, a
        // queued message getting promoted, a delete) replaces or clears
        // what's showing immediately. There is deliberately no local queueing
        // here - the overlay has no write access (it's unauthenticated by
        // design), so it can't own queue state; that lives in useChatData.js
        // on the dashboard side, which is the only client that can advance it.
        const activeMsgRef = doc(db, 'users', userId, 'active_message', 'current');
        const unsubscribeMessage = onSnapshot(activeMsgRef, (doc) => {
            setActiveMessage(doc.exists() && Object.keys(doc.data()).length > 0 ? doc.data() : null);
        });
        return () => { unsubscribeSettings(); unsubscribeMessage(); };
    }, [userId]);

    // Listen for manual "show now playing" triggers written via the API
    useEffect(() => {
        if (!userId) return;
        const triggerRef = doc(db, 'users', userId, 'overlay_triggers', 'now_playing');
        let hasSeenInitialSnapshot = false;
        const unsubscribeTrigger = onSnapshot(triggerRef, (snap) => {
            const isInitialSnapshot = !hasSeenInitialSnapshot;
            hasSeenInitialSnapshot = true;

            if (snap.exists()) {
                const data = snap.data();
                const triggerTime = data.triggeredAt ? new Date(data.triggeredAt).getTime() : 0;

                // Update ref immediately to prevent replaying this specific trigger doc later
                if (triggerTime > lastManualTriggerRef.current) {
                    lastManualTriggerRef.current = triggerTime;

                    // Only guard against staleness on the very first snapshot after mount
                    // (a leftover trigger from a previous session). The dashboard and the
                    // overlay can run on different machines with skewed clocks, so a live
                    // click here always shows immediately — it's never rejected as "stale".
                    if (isInitialSnapshot && (Date.now() - triggerTime) > 10000) {
                        console.log("[Trigger] Ignoring stale manual trigger on page load");
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
        });
        return () => {
            unsubscribeTrigger();
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        };
    }, [userId]);

    // Local, cosmetic-only auto-hide: stop rendering the active message after
    // its on-screen time is up. This does NOT touch Firestore (the overlay
    // can't - see above), so it's a visual safety net that works even if the
    // dashboard that sent this message is closed; the dashboard separately
    // deletes the Firestore doc itself once expired, which is what actually
    // advances the queue for the next viewer/session.
    useEffect(() => {
        if (!activeMessage) return;
        const duration = activeMessage.duration !== undefined ? activeMessage.duration : settings.displayDuration;
        if (!(duration > 0)) return; // -1/undefined duration means "permanent"
        const timer = setTimeout(() => setActiveMessage(null), duration * 1000 + 500);
        return () => clearTimeout(timer);
    }, [activeMessage, settings.displayDuration]);

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

    // 4. KaraFun Integration - reads users/{userId}/karafun_state/live,
    // mirrored by relay/ (the one process that still holds a real KaraFun
    // socket) instead of opening its own connection. This overlay used to
    // dial KaraFun directly with its own public, unauthenticated socket -
    // see docs/karafun-relay-design.md §0/§2/§7 for why that's gone: it was
    // one of up to three simultaneous direct sockets per broadcaster
    // (alongside every verified dashboard session), and karafunPartyId
    // (previously read here from the public settings/config) has moved to
    // owner-only private/config, which this unauthenticated page can't read
    // anyway - it doesn't need to anymore.
    useEffect(() => {
        if (!userId || !settings.karafunEnabled || (!settings.karafunOverlayQueueEnabled && !settings.karafunOverlayNowPlayingEnabled)) {
            return;
        }

        const stateRef = doc(db, 'users', userId, 'karafun_state', 'live');
        const unsubscribe = onSnapshot(stateRef, (snap) => {
            if (!snap.exists()) {
                setKarafunQueue([]);
                setKarafunNowPlaying(null);
                setKarafunPlayState('stop');
                return;
            }
            const data = snap.data();
            // Idle/infoscreen/stop ambiguity is already resolved by the
            // relay before it writes this doc (see karafunConnection.js's
            // own 'status' handler) - currentSong here is only ever a real
            // song or null, nothing left to re-derive client-side.
            const transformed = (data.upcoming || []).map((item, idx) => ({
                id: item.queueId || `${item.title}-${item.artist}-${idx}`,
                title: item.title || 'Unknown',
                artist: item.artist || '',
                singer: item.singer || '',
            })).slice(0, 5); // next 5 songs only
            setKarafunQueue(transformed);
            setKarafunNowPlaying(data.currentSong || null);
            setKarafunPlayState(data.playState || 'stop');
        });

        return () => unsubscribe();
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
                    <MessageBubble key={activeMessage.id || activeMessage.timestamp?.seconds || 'default-message-key'} message={activeMessage} settings={effectiveSettings} />
                )}
            </AnimatePresence>

            {/* KaraFun Overlays - gated on karafunEnabled too, not just the two
                overlay-widget toggles below: the mirror effect's early return
                (karafunEnabled off) leaves karafunQueue/karafunNowPlaying in
                whatever state they were last in rather than clearing them, so
                without this the last queue/Now Playing card would stay
                visible on stream after the broadcaster disables KaraFun. */}
            <AnimatePresence>
                {settings.karafunEnabled && settings.karafunOverlayQueueEnabled && karafunQueue.length > 0 && (
                    <QueueCard queue={karafunQueue} settings={settings} />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {settings.karafunEnabled && settings.karafunOverlayNowPlayingEnabled && showNowPlaying && karafunNowPlaying && (
                    <NowPlayingCard song={karafunNowPlaying} settings={settings} />
                )}
            </AnimatePresence>
        </div>
    );
}
