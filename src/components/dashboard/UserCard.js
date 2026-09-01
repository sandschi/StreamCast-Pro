'use client';

import { Shield, User, ShieldAlert, Trash2, Clock } from 'lucide-react';
import Avatar from '@/components/ui/Avatar';
import RoleSwitch from '@/components/ui/RoleSwitch';

const ROLE_ICON = {
    mod: <Shield size={10} className="text-primary-400" />,
    viewer: <User size={10} className="text-zinc-500" />,
    denied: <ShieldAlert size={10} className="text-red-400" />,
};

const ROLE_TEXT_CLASS = { mod: 'text-primary-400', viewer: 'text-zinc-500', denied: 'text-red-400' };

export default function UserCard({ displayName, twitchUsername, photoURL, role = 'viewer', online = false, lastSeen, onRoleChange, onReset }) {
    return (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-all group">
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <Avatar
                        size={48}
                        iconSize={20}
                        photoURL={photoURL}
                        username={twitchUsername}
                        ringClassName="border-2 border-zinc-800 bg-zinc-800"
                        online={online}
                    />
                    <div>
                        <h4 className="font-bold text-zinc-100 truncate max-w-[120px]" title={displayName}>
                            {displayName}
                        </h4>
                        {twitchUsername && (
                            <div className="text-[10px] text-zinc-500 -mt-0.5 lowercase">
                                @{twitchUsername}
                            </div>
                        )}
                        <div className="flex items-center gap-1 mt-1 text-[10px] font-medium uppercase tracking-wider">
                            {ROLE_ICON[role]}
                            <span className={ROLE_TEXT_CLASS[role] || ''}>{role}</span>
                        </div>
                    </div>
                </div>
                <button
                    onClick={onReset}
                    className="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                    title="Reset Permission"
                >
                    <Trash2 size={16} />
                </button>
            </div>

            <RoleSwitch value={role} onChange={onRoleChange} />

            {lastSeen && (
                <div className="mt-4 flex items-center gap-1 text-[10px] text-zinc-600">
                    <Clock size={10} />
                    <span>Active {lastSeen}</span>
                </div>
            )}
        </div>
    );
}
