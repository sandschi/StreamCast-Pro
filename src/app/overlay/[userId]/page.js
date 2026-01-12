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
    });

    useEffect(() => {
        if (!userId) return;

        // Listen to settings
        const settingsRef = doc(db, 'users', userId, 'settings', 'config');
        const unsubscribeSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) setSettings(doc.data());
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
                return {
                    initial: { x: -100, opacity: 0 },
                    animate: { x: 0, opacity: 1 },
                    exit: { x: 100, opacity: 0 }
                };
        }
    };

    const variants = getAnimationVariants();

    return (
        <div className="w-screen h-screen bg-transparent overflow-hidden flex items-end p-20">
            <AnimatePresence mode="wait">
                {activeMessage && (
                    <motion.div
                        key={activeMessage.timestamp?.seconds || Date.now()}
                        variants={variants}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="flex flex-col gap-2 max-w-2xl"
                    >
                        {/* Username Badge */}
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.2 }}
                            className="px-3 py-1 rounded-t-lg font-bold text-sm w-fit"
                            style={{ backgroundColor: activeMessage.color, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}
                        >
                            {activeMessage.username}
                        </motion.div>

                        {/* Message Body */}
                        <div
                            className="font-bold leading-tight drop-shadow-lg"
                            style={{
                                color: settings.textColor,
                                fontSize: `${settings.fontSize}px`,
                                WebkitTextStroke: `2px ${settings.strokeColor}`,
                                textStroke: `2px ${settings.strokeColor}`,
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
