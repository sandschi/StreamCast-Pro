'use client';

export default function RangeSlider({ label, value = 0, displayValue, min = 0, max = 100, step = 1, unit = '', hint, valueTone = 'default', onChange, onMouseUp, className = '' }) {
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
