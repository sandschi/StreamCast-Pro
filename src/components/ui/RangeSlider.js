'use client';

import { tiny } from '@/components/dashboard-shell/treatments';

// Optional `t` (treatment object) switches the label/value/hint text to the
// dashboard-shell's treatment-aware styling. The slider track/thumb itself
// stays the native accent-primary-600 either way — every treatment already
// uses the same green accent, so it never actually clashed.
export default function RangeSlider({ label, value = 0, displayValue, min = 0, max = 100, step = 1, unit = '', hint, valueTone = 'default', onChange, onMouseUp, className = '', t }) {
    if (t) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {label && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', ...tiny(t), color: t.faint }}>
                        <span>{label}</span>
                        <span style={{ color: valueTone === 'accent' ? t.accent : t.faint }}>{displayValue !== undefined ? displayValue : value}{unit}</span>
                    </div>
                )}
                <input
                    type="range" min={min} max={max} step={step} value={value}
                    onChange={(e) => onChange && onChange(parseFloat(e.target.value))}
                    onMouseUp={onMouseUp}
                    className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    style={{ background: t.hair }}
                />
                {hint && <p style={{ fontFamily: 'var(--font-sans)', fontSize: 11.5, color: t.faint, fontStyle: 'italic', margin: 0 }}>{hint}</p>}
            </div>
        );
    }
    return (
        <div className={`flex flex-col gap-2 ${className}`}>
            {label && (
                <div className="flex justify-between text-xs font-bold text-zinc-400 uppercase">
                    <span>{label}</span>
                    <span className={valueTone === 'accent' ? 'text-primary-500' : ''}>{displayValue !== undefined ? displayValue : value}{unit}</span>
                </div>
            )}
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange && onChange(parseFloat(e.target.value))}
                onMouseUp={onMouseUp}
                className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-primary-600"
            />
            {hint && <p className="text-[10px] text-zinc-600 italic">{hint}</p>}
        </div>
    );
}
