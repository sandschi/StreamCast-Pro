'use client';

// Full class strings, not template literals, so Tailwind's static scanner picks them up.
const TONE_CLASSES = {
    waiting: { border: 'border-yellow-500/20', iconBg: 'bg-yellow-500/10', iconBorder: 'border-yellow-500/20' },
    denied: { border: 'border-red-500/20', iconBg: 'bg-red-500/10', iconBorder: 'border-red-500/20' },
};

export default function AccessGate({ state = 'waiting', title, body, icon }) {
    const tone = TONE_CLASSES[state] || TONE_CLASSES.denied;

    return (
        <div className={`bg-zinc-900 border ${tone.border} rounded-3xl p-12 text-center space-y-6 shadow-2xl`}>
            <div className={`w-20 h-20 ${tone.iconBg} rounded-full flex items-center justify-center mx-auto border ${tone.iconBorder}`}>
                {icon}
            </div>
            <div className="space-y-2">
                <h3 className="text-2xl font-bold">{title}</h3>
                <p className="text-zinc-500 max-w-sm mx-auto">{body}</p>
            </div>
        </div>
    );
}
