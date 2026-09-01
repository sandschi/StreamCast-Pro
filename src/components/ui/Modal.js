'use client';

import { X } from 'lucide-react';
import IconButton from './IconButton';

export default function Modal({ open, title, icon, onClose, children, width = 512 }) {
    if (!open) return null;

    return (
        <div
            onClick={onClose}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200"
            style={{ background: 'rgba(0,0,0,.7)', backdropFilter: 'var(--blur-sm)' }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className="w-full flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
                style={{
                    maxWidth: width,
                    maxHeight: '80%',
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 'var(--radius-panel)',
                    boxShadow: 'var(--shadow-modal)',
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
                        <h2 className="text-lg font-bold" style={{ color: 'var(--text-heading)' }}>{title}</h2>
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
