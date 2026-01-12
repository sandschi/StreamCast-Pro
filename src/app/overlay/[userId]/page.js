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
                            className="flex items-center gap-3 px-4 py-2 z-10 shadow-xl border-b border-white/10"
                            style={{
                                backgroundColor: activeMessage.color || '#9146FF',
                                color: '#fff',
                                borderTopLeftRadius: `${settings.borderRadius}px`,
                                borderTopRightRadius: `${settings.borderRadius}px`,
                                alignSelf: settings.posX > 50 ? 'flex-end' : settings.posX > 40 ? 'center' : 'flex-start'
                            }}
                        >
                            {settings.showAvatar && (
                                <img
                                    src={activeMessage.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeMessage.login || 'twitch'}`}
                                    alt=""
                                    className="rounded-full border-2 border-white/40 shadow-md object-cover flex-shrink-0"
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
                            className="font-bold leading-tight drop-shadow-2xl px-6 py-5 bg-black/60 backdrop-blur-xl border border-white/5"
                            style={{
                                color: settings.textColor,
                                fontSize: `${settings.fontSize}px`,
                                WebkitTextStroke: `1px ${settings.strokeColor}`,
                                textStroke: `1px ${settings.strokeColor}`,
                                borderRadius: `${settings.borderRadius}px`,
                                borderTopLeftRadius: (settings.posX <= 40) ? '0' : `${settings.borderRadius}px`,
                                borderTopRightRadius: (settings.posX > 60) ? '0' : `${settings.borderRadius}px`,
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
