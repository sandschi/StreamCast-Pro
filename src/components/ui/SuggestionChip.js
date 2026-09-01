'use client';

import Image from 'next/image';
import { User, CheckCircle2, XCircle } from 'lucide-react';
import IconButton from './IconButton';

export default function SuggestionChip({ username, avatarUrl, color, text, onApprove, onDeny }) {
    return (
        <div className="flex items-center gap-3 bg-zinc-900/80 p-2 rounded-xl border border-primary-500/30 group/sug animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 max-w-[150px]">
                <div className="relative w-4 h-4 shrink-0">
                    {avatarUrl ? (
                        <Image src={avatarUrl} alt="" fill className="rounded-full object-cover" unoptimized />
                    ) : (
                        <div className="w-full h-full rounded-full bg-zinc-800 flex items-center justify-center"><User size={10} className="text-zinc-500" /></div>
                    )}
                </div>
                <span className="text-[11px] font-bold truncate" style={{ color }}>{username}:</span>
                <span className="text-[11px] text-zinc-300 truncate">{text}</span>
            </div>
            <div className="flex items-center gap-1">
                <IconButton icon={<CheckCircle2 size={14} />} size={14} tone="success" title="Approve" onClick={onApprove} />
                <IconButton icon={<XCircle size={14} />} size={14} tone="danger" title="Deny" onClick={onDeny} />
            </div>
        </div>
    );
}
