'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'next/navigation';
import io from 'socket.io-client';
import { ListMusic, User, Play } from 'lucide-react';

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
    const [messageQueue, setMessageQueue] = useState([]);
    const [processedIds] = useState(() => new Set());
    const [isProcessing, setIsProcessing] = useState(false);
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

        const activeMsgRef = doc(db, 'users', userId, 'active_message', 'current');
        const unsubscribeMessage = onSnapshot(activeMsgRef, (doc) => {
            if (doc.exists() && Object.keys(doc.data()).length > 0) {
                const data = doc.data();

                // If it's a new ID, add to queue
                if (data.id && !processedIds.has(data.id)) {
                    processedIds.add(data.id);
                    setMessageQueue(prev => [...prev, data]);
                } else if (!data.id) {
                    // Fallback for messages without IDs (testing)
                    setMessageQueue(prev => [...prev, data]);
                }
            } else if (!doc.exists()) {
                // Detected deletion (either via onSnapshot removed or doc.exists false)
                setActiveMessage(null);
            }
        });
        return () => { unsubscribeSettings(); unsubscribeMessage(); };
    }, [userId, processedIds]);

    // Listen for manual "show now playing" triggers written via the API
    useEffect(() => {
        if (!userId) return;
        const triggerRef = doc(db, 'users', userId, 'overlay_triggers', 'now_playing');
        const unsubscribeTrigger = onSnapshot(triggerRef, (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                const triggerTime = data.triggeredAt ? new Date(data.triggeredAt).getTime() : 0;
                const now = Date.now();
                const isStale = (now - triggerTime) > 10000;

                // Update ref immediately to prevent replaying this specific trigger doc later
                if (triggerTime > lastManualTriggerRef.current) {
                    const wasStaleOnLoad = lastManualTriggerRef.current === 0 && isStale;
                    lastManualTriggerRef.current = triggerTime;

                    // Only show if it's NOT stale (or if it's the first one we ever seen and it happens to be fresh)
                    if (!isStale) {
                        setShowNowPlaying(true);
                        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
                        hideTimerRef.current = setTimeout(() => setShowNowPlaying(false), 10000);
                    } else if (wasStaleOnLoad) {
                        console.log("[Trigger] Ignoring stale manual trigger on page load");
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

    const processNextMessage = useCallback(async () => {
        setIsProcessing(true);
        const nextMsg = messageQueue[0];

        // Play Sound
        if (settings.soundEnabled) {
            try {
                const audio = new Audio(SOUNDS[settings.soundType || 'pop']);
                audio.volume = settings.soundVolume !== undefined ? settings.soundVolume : 0.5;
                audio.play().catch(e => console.warn('Audio play failed:', e));
            } catch (e) {
                console.error("Sound Error:", e);
            }
        }

        setActiveMessage(nextMsg);
        setMessageQueue(prev => prev.slice(1));

        const duration = nextMsg.duration !== undefined ? nextMsg.duration : settings.displayDuration;

        if (duration > 0) {
            setTimeout(() => {
                setActiveMessage(null);
                setIsProcessing(false);
            }, duration * 1000 + 500); // Add a small buffer for animation
        } else {
            // Permanent message - stays until NEXT message arrives in queue
        }
    }, [messageQueue, settings.soundEnabled, settings.soundType, settings.soundVolume, settings.displayDuration]);

    // 3. Queue Processor
    useEffect(() => {
        if (messageQueue.length > 0 && !activeMessage && !isProcessing) {
            // Use setTimeout to avoid synchronous setState inside an effect (lint fix)
            const timer = setTimeout(() => {
                processNextMessage();
            }, 0);
            return () => clearTimeout(timer);
        }
    }, [messageQueue, activeMessage, isProcessing, processNextMessage]);

    // Interrupt permanent messages if new ones arrive
    useEffect(() => {
        if (activeMessage && (activeMessage.duration === -1 || activeMessage.duration === undefined) && messageQueue.length > 0) {
            // If the current message is permanent (or standard without a timeout set yet) 
            // and something else is waiting, clear it.
            // We only do this if it's been showing for at least 3 seconds to avoid flashing.
            const timer = setTimeout(() => {
                setActiveMessage(null);
                setIsProcessing(false);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [messageQueue.length, activeMessage]);

    // 4. KaraFun Integration
    useEffect(() => {
        if (!settings.karafunEnabled || (!settings.karafunOverlayQueueEnabled && !settings.karafunOverlayNowPlayingEnabled)) {
            return;
        }

        const partyId = settings.karafunPartyId;
        if (!partyId) return;

        const suffix = Math.floor(1000 + Math.random() * 9000);
        const loginName = `StreamCastOverlay${suffix}`;

        const socket = io('https://www.karafun.com', {
            query: { remote: `kf${partyId}` },
            transports: ['polling', 'websocket'],
            forceNew: true,
            reconnection: true,
        });

        socket.on('connect', () => {
            socket.emit('authenticate', {
                login: loginName,
                channel: partyId,
                role: 'participant',
                app: 'karafun',
                socket_id: null,
            }, null);
        });

        socket.on('queue', (items) => {
            if (!Array.isArray(items)) {
                setKarafunQueue([]);
                return;
            }
            const transformed = items.map((item, idx) => ({
                id: item.queueId || item.songId || `${item.title}-${item.artist}-${idx}`,
                title: item.title || 'Unknown',
                artist: item.artist || '',
                singer: item.singer || '',
            })).slice(0, 5); // next 5 songs only
            setKarafunQueue(transformed);
        });

        socket.on('status', (status) => {
            const cur = status?.songPlaying || status?.current || null;
            if (cur) {
                setKarafunNowPlaying({
                    title: cur.title || cur.song?.title || 'Unknown',
                    artist: cur.artist || cur.song?.artist || '',
                    singer: cur.singer || cur.singerName || cur.options?.singer || '',
                });
                setKarafunPlayState(status.state);
            } else {
                setKarafunNowPlaying((status?.state === 'infoscreen' || status?.state === 'stop') ? null : (prev => prev));
                setKarafunPlayState(status?.state);
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [settings.karafunEnabled, settings.karafunOverlayQueueEnabled, settings.karafunOverlayNowPlayingEnabled, settings.karafunPartyId]);

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

            // Pop showing immediately
            setShowNowPlaying(true);

            // Arm the shared hide timer
            hideTimerRef.current = setTimeout(() => {
                setShowNowPlaying(false);
            }, 10000);
        }
    }, [karafunNowPlaying, karafunPlayState, settings.karafunOverlayNowPlayingEnabled, hideTimerRef]);

    const getKaraFunThemeStyles = () => {
        const theme = settings.karafunOverlayTheme || 'classic';
        const baseStyles = {
            queueContainer: "absolute flex flex-col gap-3 w-80",
            nowPlayingContainer: "absolute flex flex-col items-center gap-2",
        };

        switch (theme) {
            case 'cyberpunk':
                return {
                    ...baseStyles,
                    card: "bg-black/90 border-2 border-[#00f0ff] p-4 text-[#00f0ff] shadow-[0_0_10px_#00f0ff,inset_0_0_10px_#00f0ff]",
                    highlight: "bg-[#ff003c] text-white border-2 border-[#ff003c]",
                    textPrimary: "font-black uppercase tracking-wider text-white",
                    textSecondary: "text-[#00f0ff] font-bold text-sm",
                    textTertiary: "text-zinc-400 text-xs",
                };
            case 'comic':
                return {
                    ...baseStyles,
                    card: "bg-white border-4 border-black p-4 text-black shadow-[8px_8px_0_0_#000] rotate-[-1deg]",
                    highlight: "bg-[#9146FF] text-white",
                    textPrimary: "font-black uppercase text-2xl text-black",
                    textSecondary: "font-bold text-black text-sm",
                    textTertiary: "text-zinc-600 text-xs font-bold",
                };
            case 'retro':
                return {
                    ...baseStyles,
                    card: "bg-black border-4 border-white p-4 shadow-[4px_4px_0_0_#000] font-mono",
                    highlight: "bg-white text-black",
                    textPrimary: "font-bold uppercase text-white",
                    textSecondary: "text-zinc-300 text-sm",
                    textTertiary: "text-zinc-500 text-xs",
                };
            case 'future':
                return {
                    ...baseStyles,
                    card: "bg-[#0b1622]/90 backdrop-blur-md border border-[#1271ff]/40 p-4 shadow-[0_0_30px_rgba(18,113,255,0.2)]",
                    highlight: "bg-[#1271ff]/20 border border-[#1271ff]",
                    textPrimary: "font-black text-white",
                    textSecondary: "text-[#7db8ff] text-sm",
                    textTertiary: "text-blue-200/80 text-xs",
                };
            case 'glass':
                return {
                    ...baseStyles,
                    card: "bg-black/60 backdrop-blur-xl border border-white/20 p-4 rounded-[20px]",
                    highlight: "bg-white/10 border-white/40",
                    textPrimary: "font-bold text-white",
                    textSecondary: "text-zinc-100 text-sm",
                    textTertiary: "text-zinc-200 text-xs",
                };
            case 'neon':
                return {
                    ...baseStyles,
                    card: "bg-black/85 border border-white/10 p-4 shadow-[0_0_15px_#9146FF] rounded-xl",
                    highlight: "bg-[#9146FF] shadow-[0_0_10px_#9146FF]",
                    textPrimary: "font-black text-white",
                    textSecondary: "text-[#e8d4ff] text-sm",
                    textTertiary: "text-zinc-200 text-xs",
                };
            case 'minimal':
                return {
                    ...baseStyles,
                    card: "bg-black/90 p-4 rounded-lg",
                    highlight: "border-l-4 border-white pl-4",
                    textPrimary: "font-medium text-white",
                    textSecondary: "text-zinc-200 text-sm",
                    textTertiary: "text-zinc-300 text-xs",
                };
            case 'bold':
                return {
                    ...baseStyles,
                    card: "bg-black/95 border-4 border-white p-4",
                    highlight: "bg-white text-black",
                    textPrimary: "font-black text-white",
                    textSecondary: "text-zinc-300 text-sm font-bold",
                    textTertiary: "text-zinc-400 text-xs font-bold",
                };
            case 'classic':
            default:
                return {
                    ...baseStyles,
                    card: "bg-black/80 backdrop-blur-md border border-white/10 p-4 rounded-xl",
                    highlight: "bg-white/10",
                    textPrimary: "font-bold text-white",
                    textSecondary: "text-zinc-100 text-sm",
                    textTertiary: "text-zinc-200 text-xs",
                };
        }
    };

    const getAnimationVariants = () => {
        const isRightPart = effectiveSettings.posX > 50;
        const isCenterPart = effectiveSettings.posX > 40 && effectiveSettings.posX < 60;

        switch (effectiveSettings.animationStyle) {
            case 'fade': return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
            case 'zoom': return { initial: { opacity: 0, scale: 0.5 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.5 } };
            case 'bounce': return { initial: { opacity: 0, y: 100 }, animate: { opacity: 1, y: 0, transition: { type: 'spring', damping: 10 } }, exit: { opacity: 0, scale: 0.8 } };
            case 'slide':
            default:
                const xOffset = isCenterPart ? 0 : (isRightPart ? 100 : -100);
                const yOffset = isCenterPart ? 50 : 0;
                return {
                    initial: { x: xOffset, y: yOffset, opacity: 0 },
                    animate: { x: 0, y: 0, opacity: 1 },
                    exit: { x: -xOffset, opacity: 0 }
                };
        }
    };

    const bubbleStyles = useMemo(() => {
        const baseHeaderRadiusLeft = (effectiveSettings.posX <= 40) ? '0' : `${effectiveSettings.borderRadius}px`;
        const baseHeaderRadiusRight = (effectiveSettings.posX > 60) ? '0' : `${effectiveSettings.borderRadius}px`;
        const baseBodyRadiusLeft = (effectiveSettings.posX <= 40) ? '0' : `${effectiveSettings.borderRadius}px`;
        const baseBodyRadiusRight = (effectiveSettings.posX > 60) ? '0' : `${effectiveSettings.borderRadius}px`;

        const commonBodyStyles = {
            borderRadius: `${effectiveSettings.borderRadius}px`,
            borderTopLeftRadius: baseBodyRadiusLeft,
            borderTopRightRadius: baseBodyRadiusRight,
        };

        const commonHeaderStyles = {
            borderTopLeftRadius: baseHeaderRadiusLeft,
            borderTopRightRadius: baseHeaderRadiusRight,
            color: '#fff',
        };

        const headerBgColor = activeMessage?.color || '#9146FF';
        const headerShadowColor = activeMessage?.color || 'rgba(145, 70, 255, 0.7)';

        switch (effectiveSettings.bubbleStyle) {
            case 'cyberpunk':
                return {
                    header: {
                        ...commonHeaderStyles,
                        backgroundColor: '#ff003c',
                        clipPath: 'polygon(0% 15%, 15% 0%, 100% 0%, 100% 85%, 85% 100%, 0% 100%)',
                        boxShadow: `0 0 20px #ff003c`,
                        border: 'none',
                        padding: '10px 20px',
                    },
                    body: {
                        ...commonBodyStyles,
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        border: '2px solid #00f0ff',
                        clipPath: 'polygon(0% 0%, 100% 0%, 100% 85%, 95% 100%, 0% 100%)',
                        boxShadow: `inset 0 0 10px #00f0ff80`,
                    }
                };
            case 'comic':
                return {
                    header: {
                        ...commonHeaderStyles,
                        backgroundColor: headerBgColor,
                        border: '4px solid #000',
                        transform: 'rotate(-2deg)',
                        zIndex: 2,
                        marginBottom: '-8px'
                    },
                    body: {
                        ...commonBodyStyles,
                        backgroundColor: '#fff',
                        color: '#000',
                        border: '4px solid #000',
                        boxShadow: '8px 8px 0 #000',
                        backgroundImage: 'radial-gradient(#000 10%, transparent 11%)',
                        backgroundSize: '10px 10px',
                        backgroundPosition: '0 0',
                        backgroundRepeat: 'repeat',
                        zIndex: 1,
                        // Comic tail logic
                        position: 'relative',
                    }
                };
            case 'retro':
                return {
                    header: {
                        ...commonHeaderStyles,
                        backgroundColor: headerBgColor,
                        border: '4px solid #fff',
                        boxShadow: '4px 4px 0 #000',
                        marginBottom: '4px'
                    },
                    body: {
                        ...commonBodyStyles,
                        backgroundColor: '#000',
                        border: '4px solid #fff',
                        boxShadow: '4px 4px 0 #000',
                    }
                };
            case 'future':
                return {
                    header: {
                        ...commonHeaderStyles,
                        backgroundColor: 'rgba(20, 30, 48, 0.9)',
                        border: `1px solid ${headerBgColor}`,
                        borderBottom: 'none',
                        clipPath: 'polygon(0% 0%, 90% 0%, 100% 50%, 90% 100%, 0% 100%)',
                        paddingRight: '30px'
                    },
                    body: {
                        ...commonBodyStyles,
                        backgroundColor: 'rgba(11, 22, 34, 0.85)',
                        backdropFilter: 'blur(10px)',
                        border: `1px solid ${headerBgColor}44`,
                        boxShadow: `0 0 30px ${headerBgColor}22`,
                        backgroundImage: `linear-gradient(rgba(18, 113, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(18, 113, 255, 0.05) 1px, transparent 1px)`,
                        backgroundSize: '20px 20px',
                    }
                };
            case 'glass':
                return {
                    header: {
                        ...commonHeaderStyles,
                        backgroundColor: `${headerBgColor}B3`, // 70% opacity
                        backdropFilter: 'blur(10px)',
                        border: `1px solid ${headerBgColor}80`,
                        borderBottom: 'none',
                    },
                    body: {
                        ...commonBodyStyles,
                        backgroundColor: 'rgba(0,0,0,0.4)',
                        backdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.2)',
                    }
                };
            case 'neon':
                return {
                    header: {
                        ...commonHeaderStyles,
                        backgroundColor: headerBgColor,
                        boxShadow: `0 0 15px 5px ${headerShadowColor}`,
                        borderBottom: 'none',
                    },
                    body: {
                        ...commonBodyStyles,
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: `0 0 10px 3px ${headerShadowColor}80`,
                    }
                };
            case 'minimal':
                return {
                    header: {
                        ...commonHeaderStyles,
                        backgroundColor: headerBgColor,
                        borderBottom: 'none',
                    },
                    body: {
                        ...commonBodyStyles,
                        backgroundColor: 'rgba(0,0,0,0.9)',
                        border: 'none',
                    }
                };
            case 'bold':
                return {
                    header: {
                        ...commonHeaderStyles,
                        backgroundColor: headerBgColor,
                        borderBottom: `3px solid ${effectiveSettings.strokeColor}`,
                    },
                    body: {
                        ...commonBodyStyles,
                        backgroundColor: 'rgba(0,0,0,0.95)',
                        border: `3px solid ${effectiveSettings.strokeColor}`,
                        borderTop: 'none',
                    }
                };
            case 'classic':
            default:
                return {
                    header: {
                        ...commonHeaderStyles,
                        backgroundColor: headerBgColor,
                        borderBottom: '1px solid rgba(255,255,255,0.1)',
                    },
                    body: {
                        ...commonBodyStyles,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255,255,255,0.05)',
                    }
                };
        }
    }, [effectiveSettings, activeMessage?.color]);


    return (
        <div
            className="w-screen h-screen bg-transparent overflow-hidden relative"
            style={{ fontFamily: `'${effectiveSettings.fontFamily}', sans-serif` }}
        >
            <AnimatePresence mode="wait">
                {activeMessage && (
                    <motion.div
                        key={activeMessage.id || activeMessage.timestamp?.seconds || 'default-message-key'}
                        variants={getAnimationVariants()}
                        initial="initial" animate="animate" exit="exit"
                        className="absolute flex flex-col gap-0 max-w-2xl"
                        style={{
                            left: `${effectiveSettings.posX}%`,
                            top: `${effectiveSettings.posY}%`,
                            transform: `translate(${effectiveSettings.posX > 50 ? '-100%' : effectiveSettings.posX > 40 ? '-50%' : '0%'}, ${effectiveSettings.posY > 50 ? '-100%' : '0%'})`
                        }}
                    >
                        {/* Heading: Avatar in front + Username */}
                        <div
                            className="flex items-center gap-3 px-4 py-2 z-10 shadow-xl transition-all duration-500"
                            style={{
                                ...bubbleStyles.header,
                                alignSelf: effectiveSettings.posX > 50 ? 'flex-end' : effectiveSettings.posX > 40 ? 'center' : 'flex-start',
                                transform: effectiveSettings.bubbleStyle === 'comic' ? 'rotate(-2deg)' : 'none'
                            }}
                        >
                            {effectiveSettings.showAvatar && (
                                <div className={`relative overflow-hidden rounded-full shadow-md flex-shrink-0 transition-all ${effectiveSettings.bubbleStyle === 'bold' || effectiveSettings.bubbleStyle === 'comic' ? 'border-4 border-black' :
                                    effectiveSettings.bubbleStyle === 'retro' ? 'border-4 border-white' :
                                        'border-2 border-white/40'
                                    }`}
                                    style={{ width: `${effectiveSettings.avatarSize}px`, height: `${effectiveSettings.avatarSize}px` }}
                                >
                                    <Image
                                        src={activeMessage.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeMessage.login || 'twitch'}`}
                                        alt=""
                                        fill
                                        style={{ objectFit: 'cover' }}
                                    />
                                </div>
                            )}
                            <span
                                className={`font-black tracking-tight drop-shadow-lg ${effectiveSettings.bubbleStyle === 'retro' ? 'uppercase font-mono' : ''}`}
                                style={{
                                    fontSize: `${effectiveSettings.nameSize}px`,
                                    fontFamily: effectiveSettings.bubbleStyle === 'retro' ? 'monospace' : 'inherit'
                                }}
                            >
                                {activeMessage.username}
                            </span>
                        </div>

                        {/* Message Body */}
                        <div
                            className="font-bold leading-tight drop-shadow-2xl px-6 py-5 transition-all duration-500 relative"
                            style={{
                                ...bubbleStyles.body,
                                color: effectiveSettings.textColor,
                                fontSize: `${effectiveSettings.fontSize}px`,
                                WebkitTextStroke: (effectiveSettings.bubbleStyle === 'minimal' || effectiveSettings.bubbleStyle === 'retro') ? 'none' : `1px ${effectiveSettings.strokeColor}`,
                                textStroke: (effectiveSettings.bubbleStyle === 'minimal' || effectiveSettings.bubbleStyle === 'retro') ? 'none' : `1px ${effectiveSettings.strokeColor}`,
                            }}
                        >
                            {/* Comic Style Tail */}
                            {effectiveSettings.bubbleStyle === 'comic' && (
                                <div className="absolute top-[-15px] left-[20px] w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-b-[15px] border-b-black lg:block hidden" />
                            )}

                            <div className={`flex flex-wrap items-center gap-2 ${effectiveSettings.bubbleStyle === 'minimal' ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : ''}`}>
                                {activeMessage.fragments?.map((frag, i) => (
                                    frag.type === 'text' ? <span key={i} className={effectiveSettings.bubbleStyle === 'retro' ? 'font-mono uppercase tracking-tighter' : ''}>{frag.content}</span> :
                                        <span key={i} className="h-[1.2em] w-[1.2em] relative inline-block align-middle select-none">
                                            <Image src={frag.url} alt={frag.name} fill unoptimized />
                                        </span>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* KaraFun Overlays */}
            <AnimatePresence>
                {settings.karafunOverlayQueueEnabled && karafunQueue.length > 0 && (
                    <motion.div
                        key="karafun-queue"
                        initial={{ opacity: 0, x: -60 }}
                        animate={{ opacity: 1, x: 0, transition: { duration: 0.5, ease: 'easeOut' } }}
                        exit={{ opacity: 0, x: -60, transition: { duration: 0.4, ease: 'easeIn' } }}
                        className={getKaraFunThemeStyles().queueContainer}
                        style={{
                            left: `${settings.karafunQueuePosX ?? 5}%`,
                            top: `${settings.karafunQueuePosY ?? 5}%`,
                            transform: `translate(${(settings.karafunQueuePosX ?? 5) > 50 ? '-100%' : '0%'}, ${(settings.karafunQueuePosY ?? 5) > 50 ? '-100%' : '0%'})`,
                            fontFamily: settings.karafunFontFamily ? `'${settings.karafunFontFamily}', sans-serif` : 'inherit',
                            color: settings.karafunTextColor || undefined
                        }}
                    >
                        <div className={`${getKaraFunThemeStyles().card} rounded-t-2xl font-black text-xs uppercase tracking-widest text-zinc-200 z-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]`}>
                            <ListMusic className="inline-block w-4 h-4 mr-2" /> Song Queue
                        </div>
                        <AnimatePresence>
                            {karafunQueue.map((song, i) => {
                                const isNext = i === 0;
                                const theme = getKaraFunThemeStyles();
                                return (
                                    <motion.div
                                        key={song.id}
                                        initial={{ opacity: 0, y: -20 }}
                                        animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: i * 0.07, ease: 'easeOut' } }}
                                        exit={{ opacity: 0, y: -10, transition: { duration: 0.25 } }}
                                        className={`${theme.card} relative z-10 flex flex-col gap-1 transition-all ${isNext ? theme.highlight : ''}`}
                                    >
                                        {isNext && <span className="absolute -top-3 left-4 bg-pink-500 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-lg">Next Up</span>}
                                        <div className={`${theme.textPrimary} drop-shadow-[0_1px_4px_rgba(0,0,0,1)]`}>{song.title}</div>
                                        <div className={`${theme.textSecondary} drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]`}>{song.artist}</div>
                                        {song.singer && (
                                            <div className={`mt-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md w-max ${theme.textTertiary} bg-white/10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]`}>
                                                <User size={12} /> {song.singer}
                                            </div>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {settings.karafunOverlayNowPlayingEnabled && showNowPlaying && karafunNowPlaying && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 50, scale: 0.9, transition: { duration: 0.5 } }}
                        className={getKaraFunThemeStyles().nowPlayingContainer}
                        style={{
                            left: `${settings.karafunNowPlayingPosX ?? 50}%`,
                            top: `${settings.karafunNowPlayingPosY ?? 90}%`,
                            transform: `translate(${(settings.karafunNowPlayingPosX ?? 50) > 40 && (settings.karafunNowPlayingPosX ?? 50) < 60 ? '-50%' : (settings.karafunNowPlayingPosX ?? 50) >= 60 ? '-100%' : '0%'}, ${(settings.karafunNowPlayingPosY ?? 90) > 50 ? '-100%' : '0%'})`,
                            fontFamily: settings.karafunFontFamily ? `'${settings.karafunFontFamily}', sans-serif` : 'inherit',
                            color: settings.karafunTextColor || undefined
                        }}
                    >
                        <div className="bg-green-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-[0_0_10px_#22c55e] mb-[-12px] relative z-10">
                            Now Playing
                        </div>
                        <div className={`${getKaraFunThemeStyles().card} !pb-6 !pt-8 !px-8 min-w-[400px] text-center flex flex-col items-center gap-2`}>
                            <h2 className={`${getKaraFunThemeStyles().textPrimary} text-4xl mb-1 drop-shadow-[0_2px_6px_rgba(0,0,0,1)]`}>{karafunNowPlaying.title}</h2>
                            <p className={`${getKaraFunThemeStyles().textSecondary} text-xl drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]`}>{karafunNowPlaying.artist}</p>
                            {karafunNowPlaying.singer && (
                                <div className="mt-4 bg-white/15 p-3 rounded-xl flex items-center justify-center gap-3 w-full">
                                    <User size={18} className="text-pink-400" />
                                    <span className={`${getKaraFunThemeStyles().textTertiary} !text-base font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]`}>
                                        Sung by <span className="text-pink-300 font-black">{karafunNowPlaying.singer}</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
