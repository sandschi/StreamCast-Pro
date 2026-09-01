'use client';

export default function ToggleSwitch({ checked = false, onChange, label, description, ariaLabel, className = '' }) {
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
