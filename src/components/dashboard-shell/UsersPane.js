'use client';

import { Users as UsersIcon, Trash2, Link as LinkIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useUsersData } from '@/hooks/useUsersData';
import Pane from './Pane';
import ToolBtn from './ToolBtn';
import { MONO, tiny, L } from './treatments';
import EmptyState from '@/components/ui/EmptyState';
import Avatar from '@/components/ui/Avatar';

const TONE = { mod: 'var(--success)', viewer: 'var(--primary-500)', denied: 'var(--danger)' };
const ROLES = ['mod', 'viewer', 'denied'];

export default function UsersPane({ t, d, targetUid }) {
    const { user } = useAuth();
    const { effectiveUid, userList, setRole, removePermission } = useUsersData({ targetUid, user });

    const copy = () => { if (typeof navigator !== 'undefined' && navigator.clipboard) navigator.clipboard.writeText(`${window.location.origin}/dashboard?host=${effectiveUid}`).catch(() => { }); };

    if (userList.length === 0) {
        return (
            <Pane t={t} d={d} icon={<UsersIcon size={13} />} title="Users">
                <EmptyState icon={<UsersIcon size={32} />} title="No users currently logged in." hint="Share your moderator link to see users here." />
            </Pane>
        );
    }

    const onlineCount = userList.filter(u => u.isOnline).length;

    return (
        <Pane t={t} d={d} icon={<UsersIcon size={13} />} title={`Users · ${userList.length} registered · ${onlineCount} online`} flush
            actions={<ToolBtn t={t} icon={<LinkIcon size={12} />} onClick={copy}>Copy Mod Link</ToolBtn>}>
            {/* One wrapper so this is Pane's only flush child — Pane's own content
                gap would otherwise land between every row (on top of each row's
                own divider below it), pushing each row's content down unevenly. */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', height: 24, background: t.inset, borderBottom: `1px solid ${t.hair}`, ...tiny(t), color: t.faint }}>
                    <span style={{ width: 26 }} /><span style={{ flex: 1 }}>{L(t, 'User')}</span><span style={{ width: 170 }}>{L(t, 'Role')}</span><span style={{ width: 60 }}>{L(t, 'Seen')}</span><span style={{ width: 26 }} />
                </div>
                {userList.map(u => (
                    <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', height: d.row + 10, borderBottom: `1px solid ${t.hair}`, borderLeft: `2px solid ${u.isOnline ? t.accent : 'transparent'}` }}>
                        <Avatar photoURL={u.photoURL} username={u.twitchUsername || u.displayName} size={22} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName}</div>
                            {u.twitchUsername && <div style={{ fontFamily: MONO, fontSize: 10, color: t.faint }}>@{u.twitchUsername}</div>}
                        </div>
                        <div style={{ width: 170, display: 'flex', gap: 1 }}>
                            {ROLES.map(r => (
                                <button key={r} onClick={() => setRole(u.id, r)}
                                    style={{
                                        flex: 1, height: 22, appearance: 'none', cursor: 'pointer', border: `1px solid ${u.role === r ? t.edge : t.hair}`,
                                        background: u.role === r ? (t.glow ? 'rgba(7,252,3,.14)' : t.inset) : 'transparent', color: u.role === r ? TONE[r] : t.faint,
                                        ...tiny(t)
                                    }}>{L(t, r)}</button>
                            ))}
                        </div>
                        <span style={{ width: 60, fontFamily: MONO, fontSize: 11, color: t.faint, fontVariantNumeric: 'tabular-nums' }}>
                            {u.lastSeen ? new Date(u.lastSeen.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </span>
                        <button onClick={() => removePermission(u.id)} title="Reset" style={{ width: 26, height: 22, display: 'grid', placeItems: 'center', appearance: 'none', border: 'none', background: 'transparent', color: t.faint, cursor: 'pointer' }}><Trash2 size={13} /></button>
                    </div>
                ))}
            </div>
        </Pane>
    );
}
