'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { bevel, tiny, L } from './treatments';

// A one-off overlay dialog rather than the shared ui/Modal.js - that one is
// styled for the older CSS-variable-based UI (see ChangelogModal.js); this
// needs to match the t/d-themed dashboard-shell it lives in instead.
export default function DeleteAccountModal({ t, open, onClose }) {
    const { user, userData, logout } = useAuth();
    const router = useRouter();
    const [confirmText, setConfirmText] = useState('');
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState(null);

    if (!open) return null;

    const expected = (userData?.twitchUsername || user?.displayName || '').trim();
    const matches = expected.length > 0 && confirmText.trim().toLowerCase() === expected.toLowerCase();

    const handleDelete = async () => {
        if (!matches || deleting || !user) return;
        setDeleting(true);
        setError(null);
        try {
            const idToken = await user.getIdToken();
            const res = await fetch('/api/delete-account', {
                method: 'POST',
                headers: { Authorization: `Bearer ${idToken}` },
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Deletion failed.');
            }
            await logout();
            router.push('/');
        } catch (e) {
            setError(e.message || 'Something went wrong. Your account has not been deleted.');
            setDeleting(false);
        }
    };

    return (
        <div
            onClick={deleting ? undefined : onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.75)' }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100%', maxWidth: 480, maxHeight: '85vh', overflowY: 'auto', background: t.chrome, border: `1px solid var(--danger)`, ...bevel(t) }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${t.hair}`, background: t.chrome }}>
                    <span style={{ color: 'var(--danger)', display: 'inline-flex' }}><AlertTriangle size={16} /></span>
                    <span style={{ ...tiny(t), color: 'var(--danger)', fontSize: 12 }}>{L(t, 'Delete Your Account')}</span>
                    <span style={{ flex: 1 }} />
                    <button type="button" onClick={deleting ? undefined : onClose} disabled={deleting} style={{ appearance: 'none', background: 'transparent', border: 'none', color: t.faint, cursor: deleting ? 'default' : 'pointer', display: 'inline-flex' }}>
                        <X size={16} />
                    </button>
                </div>

                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div>
                        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: t.text, margin: '0 0 8px' }}>
                            This permanently deletes your StreamCast Pro account. Specifically, right now:
                        </p>
                        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {[
                                'Your account and stored access token are deleted immediately, and we tell Twitch to revoke this app’s authorization on your account too — it won’t just quietly reconnect if you sign in again.',
                                'Your overlay settings, chat message history, and KaraFun queue/request data are permanently erased.',
                                'Any name, photo, or role entry left on other broadcasters’ channels from moderating or appearing there is cleaned up too — not just your own account.',
                                'Moderator or viewer access you were given on other broadcasters’ channels stops working — you won’t be able to sign back in to use it.',
                                'Your username becomes available for someone else to claim.',
                            ].map((line, i) => (
                                <li key={i} style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, color: t.dim, lineHeight: 1.5 }}>{line}</li>
                            ))}
                        </ul>
                    </div>

                    <div style={{ padding: '10px 12px', background: 'rgba(239,68,68,.08)', border: '1px solid var(--danger)' }}>
                        <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, color: 'var(--danger)' }}>
                            This cannot be undone. There is no backup to restore from — once you confirm, this data is gone for good.
                        </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ ...tiny(t), color: t.faint }}>
                            {expected ? <>Type <strong style={{ color: t.text }}>{expected}</strong> to confirm</> : 'Type your username to confirm'}
                        </span>
                        <input
                            type="text"
                            value={confirmText}
                            onChange={(e) => setConfirmText(e.target.value)}
                            disabled={deleting}
                            autoComplete="off"
                            spellCheck={false}
                            placeholder={expected}
                            style={{ height: 34, padding: '0 10px', background: t.inset, border: `1px solid ${t.edge}`, color: t.text, fontFamily: 'var(--font-mono)', fontSize: 13, ...bevel(t) }}
                        />
                    </div>

                    {error && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12, color: 'var(--danger)' }}>{error}</span>}

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button type="button" onClick={onClose} disabled={deleting} style={{
                            height: 32, padding: '0 14px', appearance: 'none', cursor: deleting ? 'default' : 'pointer',
                            border: `1px solid ${t.edge}`, background: 'transparent', color: t.text,
                            fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, ...bevel(t),
                        }}>
                            Cancel
                        </button>
                        <button type="button" onClick={handleDelete} disabled={!matches || deleting} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', appearance: 'none',
                            cursor: (!matches || deleting) ? 'default' : 'pointer', border: '1px solid transparent',
                            background: 'var(--danger)', color: '#fff', opacity: (!matches || deleting) ? 0.5 : 1,
                            fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, ...bevel(t),
                        }}>
                            <Trash2 size={13} />{deleting ? 'Deleting…' : 'Delete My Account'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
