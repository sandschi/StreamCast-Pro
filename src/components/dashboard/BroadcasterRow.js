'use client';

import { CheckCircle, XCircle, Clock } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';

const STATUS_ICON = {
    approved: <CheckCircle size={14} className="text-green-500" />,
    denied: <XCircle size={14} className="text-red-500" />,
    waiting: <Clock size={14} className="text-yellow-500" />,
};

// Literal per-status class strings so Tailwind's static scanner picks them up.
const GATE_ACTIVE_CLASSES = {
    approved: 'bg-green-500 text-black shadow-[0_0_15px_rgba(7,252,3,0.4)]',
    denied: 'bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]',
    waiting: 'bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.4)]',
};
const GATE_INACTIVE_CLASSES = 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-white';

function GateButton({ icon, label, active, tone, onClick }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all flex items-center gap-2 ${active ? GATE_ACTIVE_CLASSES[tone] : GATE_INACTIVE_CLASSES}`}
        >
            {icon} {label}
        </button>
    );
}

export default function BroadcasterRow({ displayName, twitchUsername, photoURL, status = 'waiting', onStatusChange }) {
    return (
        <div className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-2xl flex items-center justify-between group hover:border-zinc-700 transition-all">
            <div className="flex items-center gap-4">
                <Avatar
                    size={48}
                    iconSize={20}
                    photoURL={photoURL}
                    username={twitchUsername}
                    alt={`${displayName || 'Broadcaster'}'s avatar`}
                    ringClassName="border-2 border-zinc-800 bg-zinc-900"
                    className="shadow-xl"
                />
                <div>
                    <p className="font-bold text-zinc-100 flex items-center gap-2">
                        {displayName}
                        {STATUS_ICON[status]}
                    </p>
                    <p className="text-xs text-zinc-500">@{twitchUsername}</p>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <GateButton icon={<CheckCircle size={14} />} label="Approve" tone="approved" active={status === 'approved'} onClick={() => onStatusChange && onStatusChange('approved')} />
                <GateButton icon={<XCircle size={14} />} label="Deny" tone="denied" active={status === 'denied'} onClick={() => onStatusChange && onStatusChange('denied')} />
                <GateButton icon={<Clock size={14} />} label="Waiting" tone="waiting" active={status === 'waiting'} onClick={() => onStatusChange && onStatusChange('waiting')} />
            </div>
        </div>
    );
}
