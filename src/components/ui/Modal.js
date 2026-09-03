'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import IconButton from './IconButton';

const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, title, icon, onClose, children, width = 512 }) {
    const panelRef = useRef(null);
    const previouslyFocused = useRef(null);

    // Focus trap + restoration: move focus into the dialog when it opens (so
    // Tab starts from inside it, not wherever focus happened to be on the
    // page), cycle Tab/Shift+Tab within the dialog's own focusable elements
    // instead of leaking into whatever's hidden behind the overlay, and
    // return focus to whatever opened the dialog once it closes.
    useEffect(() => {
        if (!open) return;
        previouslyFocused.current = document.activeElement;
        panelRef.current?.focus();

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                onClose?.();
                return;
            }
            if (e.key !== 'Tab' || !panelRef.current) return;
            const focusable = Array.from(panelRef.current.querySelectorAll(FOCUSABLE_SELECTOR));
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            previouslyFocused.current?.focus?.();
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200"
            style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'var(--blur-sm)' }}
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
                className="w-full flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
                style={{
                    maxWidth: width,
                    maxHeight: '80%',
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-panel)',
                    boxShadow: 'var(--shadow-modal)',
                    outline: 'none',
                }}
            >
                <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border-strong)' }}>
                    <div className="flex items-center gap-3">
                        {icon && (
                            <div
                                className="flex items-center justify-center p-2 rounded-lg"
                                style={{ background: 'var(--accent-tint-strong)', color: 'var(--primary-400)' }}
                            >
                                {icon}
                            </div>
                        )}
                        <h2 id="modal-title" className="text-lg font-bold" style={{ color: 'var(--text-heading)' }}>{title}</h2>
                    </div>
                    <IconButton icon={<X size={18} />} title="Close" onClick={onClose} />
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                    {children}
                </div>
            </div>
        </div>
    );
}
