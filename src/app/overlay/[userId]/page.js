'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useMemo } from 'react';
import { db } from '@/lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'next/navigation';

export default function OverlayPage() {
    const { userId } = useParams();
    const [activeMessage, setActiveMessage] = useState(null);
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
    });

    // 1. Dynamic Font Loading
    useEffect(() => {
        if (!settings.fontFamily) return;
        const link = document.createElement('link');
        link.href = `https://fonts.googleapis.com/css2?family=${settings.fontFamily.replace(/\s+/g, '+')}:wght@400;700;900&display=swap`;
        link.rel = 'stylesheet';
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
            if (doc.exists()) {
                const data = doc.data();
                setActiveMessage(data);
                if (settings.displayDuration > 0) {
                    setTimeout(() => {
                        setActiveMessage(prev => (prev?.timestamp === data.timestamp ? null : prev));
                    }, settings.displayDuration * 1000);
                }
            }
        });
        return () => { unsubscribeSettings(); unsubscribeMessage(); };
    }, [userId, settings.displayDuration]);

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
                                alignSelf: settings.posX > 50 ? 'flex-end' : settings.posX > 40 ? 'center' : 'flex-start'
                            }}
                        >
                            {settings.showAvatar && (
                                <img
                                    src={activeMessage.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeMessage.login || 'twitch'}`}
                                    alt=""
                                    className={`rounded-full shadow-md object-cover flex-shrink-0 transition-all ${settings.bubbleStyle === 'bold' ? 'border-4 border-black' : 'border-2 border-white/40'}`}
                                    style={{ width: `${settings.avatarSize}px`, height: `${settings.avatarSize}px` }}
                                    onError={(e) => { e.target.src = "https://static-cdn.jtvnw.net/user-default-pictures-uv/ce57112a-449d-4beb-a573-0357fb8853d4-profile_image-70x70.png"; }}
                                />
                            )}
                            <span
                                className="font-black tracking-tight drop-shadow-lg"
                                style={{ fontSize: `${settings.nameSize}px` }}
                            >
                                {activeMessage.username}
                            </span>
                        </div>

                        {/* Message Body */}
                        <div
                            className="font-bold leading-tight drop-shadow-2xl px-6 py-5 transition-all duration-500"
                            style={{
                                ...bubbleStyles.body,
                                color: settings.bubbleStyle === 'bold' ? '#000' : settings.textColor,
                                fontSize: `${settings.fontSize}px`,
                                WebkitTextStroke: settings.bubbleStyle === 'minimal' ? 'none' : `1px ${settings.strokeColor}`,
                                textStroke: settings.bubbleStyle === 'minimal' ? 'none' : `1px ${settings.strokeColor}`,
                            }}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                {activeMessage.fragments?.map((frag, i) => (
                                    frag.type === 'text' ? <span key={i}>{frag.content}</span> :
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
