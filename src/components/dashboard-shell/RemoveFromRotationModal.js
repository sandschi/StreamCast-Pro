'use client';

import { AlertTriangle, Trash2, X } from 'lucide-react';
import { bevel, tiny, L } from './treatments';

// Same one-off overlay pattern as DeleteAccountModal.js (styled for this
// t/d-themed dashboard-shell, not the shared ui/Modal.js) - lighter weight
// since removing someone from rotation isn't as destructive as deleting an
// account, so no type-to-confirm step, just a clear warning of what's about
// to happen (including their queued songs, which get removed too).
export default function RemoveFromRotationModal({ t, open, name, queuedCount, onCancel, onConfirm }) {
    if (!open) return null;

    return (
        <div
            onClick={onCancel}
            style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.75)' }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100%', maxWidth: 400, background: t.chrome, border: `1px solid var(--danger)`, ...bevel(t) }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${t.hair}`, background: t.chrome }}>
                    <span style={{ color: 'var(--danger)', display: 'inline-flex' }}><AlertTriangle size={16} /></span>
                    <span style={{ ...tiny(t), color: 'var(--danger)', fontSize: 12 }}>{L(t, 'Remove From Rotation')}</span>
                    <span style={{ flex: 1 }} />
                    <button type="button" onClick={onCancel} style={{ appearance: 'none', background: 'transparent', border: 'none', color: t.faint, cursor: 'pointer', display: 'inline-flex' }}>
                        <X size={16} />
                    </button>
                </div>

                <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <p style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: t.text, margin: 0 }}>
                        Remove <strong style={{ color: t.text }}>{name}</strong> from the rotation?
                        {queuedCount > 0 && (
                            <> Their {queuedCount} queued song{queuedCount === 1 ? '' : 's'} will also be removed{queuedCount === 1 ? '' : ' (including duets)'}.</>
                        )}
                    </p>

                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                        <button type="button" onClick={onCancel} style={{
                            height: 32, padding: '0 14px', appearance: 'none', cursor: 'pointer',
                            border: `1px solid ${t.edge}`, background: 'transparent', color: t.text,
                            fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, ...bevel(t),
                        }}>
                            Cancel
                        </button>
                        <button type="button" onClick={onConfirm} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 14px', appearance: 'none',
                            cursor: 'pointer', border: '1px solid transparent',
                            background: 'var(--danger)', color: '#fff',
                            fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, ...bevel(t),
                        }}>
                            <Trash2 size={13} />Remove
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
