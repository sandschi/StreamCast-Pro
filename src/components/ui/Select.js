'use client';

export default function Select({ label, value, options = [], onChange, className = '', selectClassName = '' }) {
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
                {options.map((o) => {
                    const val = typeof o === 'string' ? o : o.value;
                    const lbl = typeof o === 'string' ? o : o.label;
                    return (
                        <option key={val} value={val}>
                            {lbl}
                        </option>
                    );
                })}
            </select>
        </label>
    );
}
