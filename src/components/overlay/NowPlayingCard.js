'use client';

import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { getKaraFunThemeStyles } from './karafunTheme';

export default function NowPlayingCard({ song, settings }) {
    const theme = getKaraFunThemeStyles(settings.karafunOverlayTheme);

    return (
        <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9, transition: { duration: 0.5 } }}
            className={theme.nowPlayingContainer}
            style={{
                left: `${settings.karafunNowPlayingPosX ?? 50}%`,
                top: `${settings.karafunNowPlayingPosY ?? 90}%`,
                transform: `translate(${(settings.karafunNowPlayingPosX ?? 50) > 40 && (settings.karafunNowPlayingPosX ?? 50) < 60 ? '-50%' : (settings.karafunNowPlayingPosX ?? 50) >= 60 ? '-100%' : '0%'}, ${(settings.karafunNowPlayingPosY ?? 90) > 50 ? '-100%' : '0%'})`,
                fontFamily: settings.karafunFontFamily ? `'${settings.karafunFontFamily}', sans-serif` : 'inherit',
                color: settings.karafunTextColor || undefined
            }}
        >
            <div className="bg-primary-500 text-black text-[11px] font-black uppercase tracking-[0.2em] px-4 py-1.5 rounded-full shadow-[0_0_20px_rgba(7,252,3,0.6)] mb-[-14px] relative z-20">
                Now Playing
            </div>
            <div className={`${theme.card} !pb-6 !pt-8 !px-8 min-w-[400px] text-center flex flex-col items-center gap-2`}>
                <h2 className={`${theme.textPrimary} text-4xl mb-1 drop-shadow-[0_2px_6px_rgba(0,0,0,1)]`}>{song.title}</h2>
                <p className={`${theme.textSecondary} text-xl drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]`}>{song.artist}</p>
                {song.singer && (
                    <div className="mt-4 bg-white/15 p-3 rounded-xl flex items-center justify-center gap-3 w-full">
                        <User size={18} className="text-primary-400" />
                        <span className={`${theme.textTertiary} !text-base font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]`}>
                            Sung by <span className="text-primary-300 font-black">{song.singer}</span>
                        </span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
