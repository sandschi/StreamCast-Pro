'use client';

import { bevel, tiny } from '@/components/dashboard-shell/treatments';

// Optional `t` (treatment object) switches this from the fixed Tailwind dark
// theme to the dashboard-shell's treatment-aware styling — pass it when this
// is used inside dashboard-shell panes so it doesn't stick out as the only
// control that never reacts to carbon/graphite/slate/phosphor.
export default function TextInput({ value, placeholder, label, mono = false, readOnly = false, onChange, className = '', inputClassName = '', t }) {
    if (t) {
        return (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {label && <span style={{ ...tiny(t), color: t.faint }}>{label}</span>}
                <input
                    value={value}
                    placeholder={placeholder}
                    readOnly={readOnly}
                    onChange={(e) => onChange && onChange(e.target.value)}
                    style={{
                        width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px', outline: 'none',
                        background: t.inset, border: `1px solid ${t.hair}`, color: readOnly ? t.faint : t.text,
                        fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', textTransform: mono ? 'uppercase' : 'none', fontSize: 12.5,
                        ...bevel(t),
                    }}
                />
            </label>
        );
    }
    return (
        <label className={`flex flex-col gap-2 ${className}`}>
            {label && (
                <span className="text-xs font-bold text-zinc-400 uppercase">{label}</span>
            )}
            <input
                value={value}
                placeholder={placeholder}
                readOnly={readOnly}
                onChange={(e) => onChange && onChange(e.target.value)}
                className={`w-full bg-zinc-800 border border-zinc-700/50 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary-600 transition-all ${readOnly ? 'text-zinc-500' : 'text-zinc-100'} ${mono ? 'font-mono uppercase' : 'font-medium'} ${inputClassName}`}
            />
        </label>
    );
}
