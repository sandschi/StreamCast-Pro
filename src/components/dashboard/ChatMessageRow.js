'use client';

import Image from 'next/image';
import { Send, ScreenShare } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { formatTimestamp } from '@/lib/utils';

export default function ChatMessageRow({ msg, userRole, onShow, onShowPermanent }) {
    return (
        <div className="group flex flex-col gap-1 bg-zinc-800/20 p-3 rounded-xl border border-white/5 hover:border-zinc-700 hover:bg-zinc-800/40 transition-all duration-200">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <Avatar
                        size={40}
                        iconSize={40}
                        photoURL={msg.avatarUrl}
                        username={msg.username}
                        alt={msg.username}
                        ringClassName="border border-white/10 bg-zinc-900"
                    />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-zinc-100 truncate">
                                {msg.username}
                                {msg.isMod && <Badge tone="success" size="sm" className="ml-2">MOD</Badge>}
                            </span>
                            <span className="text-xs text-zinc-400 whitespace-nowrap tabular-nums font-medium">
                                • {formatTimestamp(msg.timestamp)}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {(userRole === 'broadcaster' || userRole === 'mod') && (
                        <button
                            onClick={onShowPermanent}
                            className="px-3 py-1.5 rounded-full text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all scale-95 hover:scale-100 shadow-md"
                            title="Show Permanently (∞)"
                        >
                            <span className="text-[10px] font-black uppercase tracking-tighter">Send ∞</span>
                        </button>
                    )}
                    <button onClick={onShow} className="btn-awesome !px-4 !py-1.5">
                        {userRole === 'viewer' ? (
                            <>
                                <Send size={12} />
                                <span>Suggest</span>
                            </>
                        ) : (
                            <>
                                <ScreenShare size={12} />
                                <span>Show</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
            <div className="text-zinc-200 text-sm flex flex-wrap items-center gap-1.5 leading-relaxed pl-7">
                {msg.fragments.map((frag, i) => (
                    frag.type === 'text' ? <span key={i}>{frag.content}</span> :
                        <span key={i} className="h-[1.2em] w-[1.2em] relative inline-block align-middle select-none">
                            <Image src={frag.url} alt={frag.name} fill unoptimized />
                        </span>
                ))}
            </div>
        </div>
    );
}
