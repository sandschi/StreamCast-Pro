'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ListMusic, User } from 'lucide-react';
import { getKaraFunThemeStyles } from './karafunTheme';

export default function QueueCard({ queue, settings }) {
    const theme = getKaraFunThemeStyles(settings.karafunOverlayTheme);

    return (
        <motion.div
            key="karafun-queue"
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.5, ease: 'easeOut' } }}
            exit={{ opacity: 0, x: -60, transition: { duration: 0.4, ease: 'easeIn' } }}
            className={theme.queueContainer}
            style={{
                left: `${settings.karafunQueuePosX ?? 5}%`,
                top: `${settings.karafunQueuePosY ?? 5}%`,
                transform: `translate(${(settings.karafunQueuePosX ?? 5) > 50 ? '-100%' : '0%'}, ${(settings.karafunQueuePosY ?? 5) > 50 ? '-100%' : '0%'})`,
                fontFamily: settings.karafunFontFamily ? `'${settings.karafunFontFamily}', sans-serif` : 'inherit',
                color: settings.karafunTextColor || undefined
            }}
        >
            <div className={`${theme.card} rounded-t-2xl font-black text-xs uppercase tracking-widest text-zinc-200 z-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]`}>
                <ListMusic className="inline-block w-4 h-4 mr-2" /> Song Queue
            </div>
            <AnimatePresence>
                {queue.map((song, i) => {
                    const isNext = i === 0;
                    return (
                        <motion.div
                            key={song.id}
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: i * 0.07, ease: 'easeOut' } }}
                            exit={{ opacity: 0, y: -10, transition: { duration: 0.25 } }}
                            className={`${theme.card} relative z-10 flex flex-col gap-1 transition-all ${isNext ? theme.highlight : ''}`}
                        >
                            {isNext && <span className="absolute -top-3 left-4 bg-primary-500 text-black text-[10px] font-black uppercase px-3 py-1 rounded-full shadow-[0_0_10px_rgba(7,252,3,0.5)] z-20">Next Up</span>}
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
    );
}
