'use client';

// Literal per-id class strings so Tailwind's static scanner picks them up.
const SWATCH_CLASSES = {
    classic: 'bg-zinc-700 border border-white/20',
    glass: 'bg-white/10 backdrop-blur-sm border border-white/20',
    neon: 'bg-zinc-950 border border-primary-500 shadow-[0_0_5px_purple]',
    minimal: 'border-none bg-transparent',
    bold: 'bg-white border-2 border-black',
    cyberpunk: 'bg-zinc-900 border-l-2 border-l-[#ff003c] border-r-2 border-r-[#00f0ff]',
    comic: 'bg-white border-2 border-black after:content-[""] after:absolute after:inset-0 after:bg-[radial-gradient(#000_15%,transparent_16%)] after:bg-[length:3px_3px]',
    retro: 'bg-zinc-900 border-2 border-white',
    future: 'bg-zinc-900 border border-blue-500/30 after:content-[""] after:absolute after:inset-0 after:bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,128,255,0.1)_50%)] after:bg-[length:100%_2px]',
};

export default function StyleTile({ id, label, selected = false, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${selected
                ? 'bg-primary-600/10 border-primary-500 text-primary-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                : 'bg-zinc-800/50 border-zinc-700 text-zinc-500 hover:border-zinc-600'
                }`}
        >
            <div className={`w-8 h-4 rounded-sm relative overflow-hidden ${SWATCH_CLASSES[id] || SWATCH_CLASSES.bold}`} />
            <span className="text-[10px] font-bold uppercase tracking-tighter">{label}</span>
        </button>
    );
}
