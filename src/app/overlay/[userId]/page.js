'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
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
        animationStyle: 'slide',
        displayDuration: 5,
        borderRadius: 12,
        positionVertical: 'bottom',
        positionHorizontal: 'left',
        showAvatar: true,
    });

    useEffect(() => {
        if (!userId) return;

        // Listen to settings
        const settingsRef = doc(db, 'users', userId, 'settings', 'config');
        const unsubscribeSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setSettings(prev => ({ ...prev, ...doc.data() }));
        });

        // Listen to active message
        const messageRef = doc(db, 'users', userId, 'active_message', 'current');
        const unsubscribeMessage = onSnapshot(messageRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setActiveMessage(data);

                // Auto-clear logic
                if (settings.displayDuration > 0) {
                    setTimeout(() => {
                        setActiveMessage(prev => (prev?.timestamp === data.timestamp ? null : prev));
                    }, settings.displayDuration * 1000);
                }
            }
        });

        return () => {
            unsubscribeSettings();
            unsubscribeMessage();
        };
    }, [userId, settings.displayDuration]);

    const getAnimationVariants = () => {
        const isRight = settings.positionHorizontal === 'right';
        const isCenter = settings.positionHorizontal === 'center';

        switch (settings.animationStyle) {
            case 'fade':
                return {
                    initial: { opacity: 0 },
                    animate: { opacity: 1 },
                    exit: { opacity: 0 }
                };
            case 'zoom':
                return {
                    initial: { opacity: 0, scale: 0.5 },
                    animate: { opacity: 1, scale: 1 },
                    exit: { opacity: 0, scale: 1.5 }
                };
            case 'bounce':
                return {
                    initial: { opacity: 0, y: 100 },
                    animate: { opacity: 1, y: 0, transition: { type: 'spring', damping: 10 } },
                    exit: { opacity: 0, scale: 0.8 }
                };
            case 'slide':
            default:
                const xOffset = isRight ? 100 : isCenter ? 0 : -100;
                const yOffset = isCenter ? 50 : 0;
                return {
                    initial: { x: xOffset, y: yOffset, opacity: 0 },
                    animate: { x: 0, y: 0, opacity: 1 },
                    exit: { x: -xOffset, opacity: 0 }
                };
        }
    };

    const getPositionClasses = () => {
        const v = settings.positionVertical || 'bottom';
        const h = settings.positionHorizontal || 'left';
        const vClass = v === 'top' ? 'justify-start' : v === 'center' ? 'justify-center' : 'justify-end';
        const hClass = h === 'left' ? 'items-start' : h === 'center' ? 'items-center' : 'items-end';
        return `${vClass} ${hClass}`;
    };

    const variants = getAnimationVariants();

    return (
        <div className={`w-screen h-screen bg-transparent overflow-hidden flex flex-col p-10 md:p-20 ${getPositionClasses()}`}>
            <AnimatePresence mode="wait">
                {activeMessage && (
                    <motion.div
                        key={activeMessage.timestamp?.seconds || Date.now()}
                        variants={variants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="flex flex-col gap-0 max-w-2xl relative"
                        style={{ alignItems: settings.positionHorizontal === 'right' ? 'flex-end' : settings.positionHorizontal === 'center' ? 'center' : 'flex-start' }}
                    >
                        {/* Heading: Avatar + Username */}
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.1 }}
                            className="flex items-center gap-3 px-4 py-2 z-10 shadow-lg border-b border-white/10"
                            style={{
                                backgroundColor: activeMessage.color,
                                color: '#fff',
                                borderTopLeftRadius: `${settings.borderRadius}px`,
                                borderTopRightRadius: `${settings.borderRadius}px`,
                                marginLeft: settings.positionHorizontal === 'right' ? '0' : '8px',
                                marginRight: settings.positionHorizontal === 'right' ? '8px' : '0',
                            }}
                        >
                            {activeMessage && (
                                <img
                                    src={activeMessage.avatarUrl || `https://api.dicebear.com/7.x/identicon/svg?seed=${activeMessage.login || 'twitch'}`}
                                    alt=""
                                    className="w-10 h-10 rounded-full border-2 border-white/40 shadow-xl object-cover bg-zinc-800"
                                    onError={(e) => {
                                        // Final fallback to the official twitch default
                                        e.target.src = "https://static-cdn.jtvnw.net/user-default-pictures-uv/ce57112a-449d-4beb-a573-0357fb8853d4-profile_image-70x70.png";
                                    }}
                                />
                            )}
                            <span className="font-bold text-sm tracking-wide drop-shadow-md">
                                {activeMessage.username}
                            </span>
                        </motion.div>

                        {/* Message Body */}
                        <div
                            className="font-bold leading-tight drop-shadow-2xl px-6 py-4 bg-black/40 backdrop-blur-md border border-white/10"
                            style={{
                                color: settings.textColor,
                                fontSize: `${settings.fontSize}px`,
                                WebkitTextStroke: `1px ${settings.strokeColor}`,
                                textStroke: `1px ${settings.strokeColor}`,
                                borderRadius: `${settings.borderRadius}px`,
                                borderTopLeftRadius: settings.positionHorizontal === 'left' ? '0' : `${settings.borderRadius}px`,
                                borderTopRightRadius: settings.positionHorizontal === 'right' ? '0' : `${settings.borderRadius}px`,
                            }}
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                {activeMessage.fragments?.map((frag, i) => (
                                    frag.type === 'text' ? (
                                        <span key={i}>{frag.content}</span>
                                    ) : (
                                        <img key={i} src={frag.url} alt={frag.name} className="h-[1.2em] inline-block align-middle" />
                                    )
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
