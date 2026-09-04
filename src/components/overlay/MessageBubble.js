'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import { getAnimationVariants, getBubbleStyles } from './messageBubbleStyles';

export default function MessageBubble({ message, settings }) {
    const bubbleStyles = getBubbleStyles(settings, message.color);

    return (
        <motion.div
            variants={getAnimationVariants(settings)}
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
                    <div className={`relative overflow-hidden rounded-full shadow-md flex-shrink-0 transition-all ${settings.bubbleStyle === 'bold' || settings.bubbleStyle === 'comic' ? 'border-4 border-black' :
                        settings.bubbleStyle === 'retro' ? 'border-4 border-white' :
                            'border-2 border-white/40'
                        }`}
                        style={{ width: `${settings.avatarSize}px`, height: `${settings.avatarSize}px` }}
                    >
                        {message.avatarUrl ? (
                            <Image
                                src={message.avatarUrl}
                                alt=""
                                fill
                                style={{ objectFit: 'cover' }}
                                unoptimized
                            />
                        ) : (
                            <div className="w-full h-full bg-black/40 flex items-center justify-center text-white/50">
                                <User size={settings.avatarSize * 0.5} />
                            </div>
                        )}
                    </div>
                )}
                <span
                    className={`font-black tracking-tight drop-shadow-lg ${settings.bubbleStyle === 'retro' ? 'uppercase' : ''}`}
                    style={{
                        fontSize: `${settings.nameSize}px`,
                        fontFamily: 'inherit'
                    }}
                >
                    {message.username}
                </span>
            </div>

            {/* Message Body */}
            <div
                className="font-bold leading-tight drop-shadow-2xl px-6 py-5 transition-all duration-500 relative"
                style={{
                    ...bubbleStyles.body,
                    color: settings.textColor,
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
                    {message.fragments?.map((frag, i) => (
                        frag.type === 'text' ? <span key={i} className={settings.bubbleStyle === 'retro' ? 'uppercase tracking-tighter' : ''}>{frag.content}</span> :
                            <span key={i} className="h-[1.2em] w-[1.2em] relative inline-block align-middle select-none">
                                <Image src={frag.url} alt={frag.name} fill unoptimized />
                            </span>
                    ))}
                </div>
            </div>
        </motion.div>
    );
}
