'use client';

import { bevel } from '@/components/dashboard-shell/treatments';

// Optional `t` (treatment object) switches the label/description card from the
// fixed Tailwind dark theme to the dashboard-shell's treatment-aware styling.
// The switch pill itself is unaffected — it already uses the same green accent
// (--primary-500) as every treatment via its own CSS class in globals.css.
export default function ToggleSwitch({ checked = false, onChange, label, description, ariaLabel, className = '', t }) {
    const sw = (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel || label}
            onClick={() => onChange && onChange(!checked)}
            className={`toggle-switch ${className}`}
            data-state={checked ? 'checked' : 'unchecked'}
        >
            <div className="toggle-thumb" />
        </button>
    );

    if (!label) return sw;

    if (t) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, background: t.inset, border: `1px solid ${t.hair}`, ...bevel(t) }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 700, color: t.text }}>{label}</span>
                    {description && <span style={{ fontFamily: 'var(--font-sans)', fontSize: 11, color: t.faint, fontStyle: 'italic' }}>{description}</span>}
                </div>
                {sw}
            </div>
        );
    }

    return (
        <div className="flex items-center justify-between p-4 bg-zinc-800/20 rounded-2xl border border-white/5">
            <div className="space-y-1">
                <p className="text-sm font-bold text-zinc-200">{label}</p>
                {description && <p className="text-xs text-zinc-500 italic">{description}</p>}
            </div>
            {sw}
        </div>
    );
}
