'use client';

const OPTIONS = [
    { id: 'viewer', label: 'Viewer', active: 'bg-zinc-100 text-zinc-900 border-zinc-100' },
    { id: 'mod', label: 'Mod', active: 'bg-primary-500 text-black border-primary-500 shadow-[0_0_15px_rgba(7,252,3,0.4)]' },
    { id: 'denied', label: 'Denied', active: 'bg-red-500 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)]' },
];

const INACTIVE_BY_ID = {
    viewer: 'bg-zinc-800/50 text-zinc-500 border-zinc-800 hover:border-zinc-700',
    mod: 'bg-transparent text-zinc-500 border-zinc-800 hover:border-primary-500/30',
    denied: 'bg-transparent text-zinc-500 border-zinc-800 hover:border-red-500/30',
};

export default function RoleSwitch({ value = 'viewer', onChange }) {
    return (
        <div className="grid grid-cols-3 gap-2">
            {OPTIONS.map((o) => (
                <button
                    key={o.id}
                    type="button"
                    onClick={() => onChange && onChange(o.id)}
                    className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] transition-all border ${value === o.id ? o.active : INACTIVE_BY_ID[o.id]}`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}
