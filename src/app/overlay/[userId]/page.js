'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'next/navigation';

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
    const filters = useRef({ processedIds: new Set() });

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

    // 1. Dynamic Font Loading
    useEffect(() => {
        if (!settings.fontFamily) return;
        const link = document.createElement('link');

        // Some fonts like Monoton only have weight 400, so we use a more flexible approach
        const fontName = settings.fontFamily.replace(/\s+/g, '+');
        // Request multiple weights but Google Fonts will only load what's available
        link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@400;700;900&display=swap`;
        link.rel = 'stylesheet';

        // Add error handling to prevent font loading from breaking the overlay
        link.onerror = () => {
            console.warn(`Failed to load font: ${settings.fontFamily}, falling back to system fonts`);
        };

        document.head.appendChild(link);
        return () => { try { document.head.removeChild(link); } catch (e) { } };
    }, [settings.fontFamily]);

    useEffect(() => {
        if (!userId) return;
        const settingsRef = doc(db, 'users', userId, 'settings', 'config');
        const unsubscribeSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setSettings(prev => ({ ...prev, ...doc.data() }));
        });

        const messageRef = doc(db, 'users', userId, 'active_message', 'current');
        const unsubscribeMessage = onSnapshot(messageRef, (doc) => {
            if (doc.exists() && Object.keys(doc.data()).length > 0) {
                const data = doc.data();

                // Play Sound if enabled and it's a new message
                if (settings.soundEnabled && data.id && !filters.current.processedIds.has(data.id)) {
                    try {
                        const audio = new Audio(SOUNDS[settings.soundType || 'pop']);
                        audio.volume = settings.soundVolume !== undefined ? settings.soundVolume : 0.5;
                        audio.play().catch(e => console.warn('Audio play failed:', e));
                        filters.current.processedIds.add(data.id);

                        // Cleanup old IDs
                        if (filters.current.processedIds.size > 50) {
                            const it = filters.current.processedIds.values();
                            filters.current.processedIds.delete(it.next().value);
                        }
                    } catch (e) {
                        console.error("Sound Error:", e);
                    }
                }

                setActiveMessage(data);

                // Determine duration: per-message override > global setting
                const duration = data.duration !== undefined ? data.duration : settings.displayDuration;

                if (duration > 0) {
                    setTimeout(() => {
                        setActiveMessage(prev => (prev?.timestamp === data.timestamp ? null : prev));
                    }, duration * 1000);
                }
            } else {
                setActiveMessage(null); // Clear overlay if doc is deleted or empty
            }
        });
        return () => { unsubscribeSettings(); unsubscribeMessage(); };
    }, [userId, settings.displayDuration, settings.soundEnabled, settings.soundType, settings.soundVolume]);

    const getAnimationVariants = () => {
        const isRightPart = settings.posX > 50;
        const isCenterPart = settings.posX > 40 && settings.posX < 60;

        switch (settings.animationStyle) {
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
        const baseHeaderRadiusLeft = (settings.posX <= 40) ? '0' : `${settings.borderRadius}px`;
        const baseHeaderRadiusRight = (settings.posX > 60) ? '0' : `${settings.borderRadius}px`;
        const baseBodyRadiusLeft = (settings.posX <= 40) ? '0' : `${settings.borderRadius}px`;
        const baseBodyRadiusRight = (settings.posX > 60) ? '0' : `${settings.borderRadius}px`;

        const commonBodyStyles = {
            borderRadius: `${settings.borderRadius}px`,
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

        switch (settings.bubbleStyle) {
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
                        borderBottom: `3px solid ${settings.strokeColor}`,
                    },
                    body: {
                        ...commonBodyStyles,
                        backgroundColor: 'rgba(0,0,0,0.95)',
                        border: `3px solid ${settings.strokeColor}`,
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
    }, [settings, activeMessage?.color]);


    return (
        <div
            className="w-screen h-screen bg-transparent overflow-hidden relative"
            style={{ fontFamily: `'${settings.fontFamily}', sans-serif` }}
        >
            <AnimatePresence mode="wait">
                {activeMessage && (
                    <motion.div
                        key={activeMessage.timestamp?.seconds || Date.now()}
                        variants={getAnimationVariants()}
                        initial="initial" animate="animate" exit="exit"
                        className="absolute flex flex-col gap-0 max-w-2xl"
                        style={{
                            left: `${settings.posX}%`,
                            top: `${settings.posY}%`,
                            transform: `translate(${settings.posX > 50 ? '-100%' : settings.posX > 40 ? '-50%' : '0%'}, ${settings.posY > 50 ? '-100%' : '0%'})`
                        }}
                    >
                        {/* Heading: Avatar in front + Username */}
                        <div
                            className="flex items-center gap-3 px-4 py-2 z-10 shadow-xl transition-all duration-500"
                            style={{
                                ...bubbleStyles.header,
                                alignSelf: settings.posX > 50 ? 'flex-end' : settings.posX > 40 ? 'center' : 'flex-start',
                                transform: settings.bubbleStyle === 'comic' ? 'rotate(-2deg)' : 'none'
                            }}
                        >
                            {settings.showAvatar && (
                                <img
                                    src={activeMessage.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeMessage.login || 'twitch'}`}
                                    alt=""
                                    className={`rounded-full shadow-md object-cover flex-shrink-0 transition-all ${settings.bubbleStyle === 'bold' || settings.bubbleStyle === 'comic' ? 'border-4 border-black' :
                                        settings.bubbleStyle === 'retro' ? 'border-4 border-white' :
                                            'border-2 border-white/40'
                                        }`}
                                    style={{ width: `${settings.avatarSize}px`, height: `${settings.avatarSize}px` }}
                                    onError={(e) => { e.target.src = "https://static-cdn.jtvnw.net/user-default-pictures-uv/ce57112a-449d-4beb-a573-0357fb8853d4-profile_image-70x70.png"; }}
                                />
                            )}
                            <span
                                className={`font-black tracking-tight drop-shadow-lg ${settings.bubbleStyle === 'retro' ? 'uppercase font-mono' : ''}`}
                                style={{
                                    fontSize: `${settings.nameSize}px`,
                                    fontFamily: settings.bubbleStyle === 'retro' ? 'monospace' : 'inherit'
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
                                color: (settings.bubbleStyle === 'bold' || settings.bubbleStyle === 'comic') ? '#000' : settings.textColor,
                                fontSize: `${settings.fontSize}px`,
                                WebkitTextStroke: (settings.bubbleStyle === 'minimal' || settings.bubbleStyle === 'retro') ? 'none' : `1px ${settings.strokeColor}`,
                                textStroke: (settings.bubbleStyle === 'minimal' || settings.bubbleStyle === 'retro') ? 'none' : `1px ${settings.strokeColor}`,
                            }}
                        >
                            {/* Comic Style Tail */}
                            {settings.bubbleStyle === 'comic' && (
                                <div className="absolute top-[-15px] left-[20px] w-0 h-0 border-l-[15px] border-l-transparent border-r-[15px] border-r-transparent border-b-[15px] border-b-black lg:block hidden" />
                            )}

                            <div className={`flex flex-wrap items-center gap-2 ${settings.bubbleStyle === 'minimal' ? 'drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]' : ''}`}>
                                {activeMessage.fragments?.map((frag, i) => (
                                    frag.type === 'text' ? <span key={i} className={settings.bubbleStyle === 'retro' ? 'font-mono uppercase tracking-tighter' : ''}>{frag.content}</span> :
                                        <img key={i} src={frag.url} alt={frag.name} className="h-[1.2em] inline-block align-middle select-none" />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
