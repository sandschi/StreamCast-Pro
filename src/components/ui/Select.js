'use client';

import { bevel, tiny } from '@/components/dashboard-shell/treatments';

// Optional `t` (treatment object) switches this from the fixed Tailwind dark
// theme to the dashboard-shell's treatment-aware styling.
export default function Select({ label, value, options = [], onChange, className = '', selectClassName = '', t }) {
    const opts = options.map((o) => ({ val: typeof o === 'string' ? o : o.value, lbl: typeof o === 'string' ? o : o.label }));
    if (t) {
        return (
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {label && <span style={{ ...tiny(t), color: t.faint }}>{label}</span>}
                <select
                    value={value}
                    onChange={(e) => onChange && onChange(e.target.value)}
                    style={{
                        width: '100%', boxSizing: 'border-box', height: 32, padding: '0 10px', outline: 'none', cursor: 'pointer',
                        background: t.inset, border: `1px solid ${t.hair}`, color: t.text, fontFamily: 'var(--font-sans)', fontSize: 12.5,
                        ...bevel(t),
                    }}
                >
                    {opts.map(({ val, lbl }) => <option key={val} value={val}>{lbl}</option>)}
                </select>
            </label>
        );
    }
    return (
        <label className={`flex flex-col gap-2 ${className}`}>
            {label && (
                <span className="text-xs font-bold text-zinc-400 uppercase">{label}</span>
            )}
            <select
                value={value}
                onChange={(e) => onChange && onChange(e.target.value)}
                className={`w-full bg-zinc-800 border border-zinc-700/50 rounded-xl px-3 py-2.5 text-zinc-200 outline-none cursor-pointer ${selectClassName}`}
            >
                {opts.map(({ val, lbl }) => <option key={val} value={val}>{lbl}</option>)}
            </select>
        </label>
    );
}
