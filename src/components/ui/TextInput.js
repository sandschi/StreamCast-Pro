'use client';

export default function TextInput({ value, placeholder, label, mono = false, readOnly = false, onChange, className = '', inputClassName = '' }) {
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
