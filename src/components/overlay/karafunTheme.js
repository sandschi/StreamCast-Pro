export function getKaraFunThemeStyles(theme = 'classic') {
    const baseStyles = {
        queueContainer: "absolute flex flex-col gap-3 w-80",
        nowPlayingContainer: "absolute flex flex-col items-center gap-2",
    };

    switch (theme) {
        case 'cyberpunk':
            return {
                ...baseStyles,
                card: "bg-black/90 border-2 border-[#00f0ff] p-4 text-[#00f0ff] shadow-[0_0_10px_#00f0ff,inset_0_0_10px_#00f0ff]",
                highlight: "bg-[#ff003c] text-white border-2 border-[#ff003c]",
                textPrimary: "font-black uppercase tracking-wider text-white",
                textSecondary: "text-[#00f0ff] font-bold text-sm",
                textTertiary: "text-zinc-400 text-xs",
            };
        case 'comic':
            return {
                ...baseStyles,
                card: "bg-white border-4 border-black p-4 text-black shadow-[8px_8px_0_0_#000] rotate-[-1deg]",
                highlight: "bg-[#9146FF] text-white",
                textPrimary: "font-black uppercase text-2xl text-black",
                textSecondary: "font-bold text-black text-sm",
                textTertiary: "text-zinc-600 text-xs font-bold",
            };
        case 'retro':
            return {
                ...baseStyles,
                card: "bg-black border-4 border-white p-4 shadow-[4px_4px_0_0_#000] font-mono",
                highlight: "bg-white text-black",
                textPrimary: "font-bold uppercase text-white",
                textSecondary: "text-zinc-300 text-sm",
                textTertiary: "text-zinc-500 text-xs",
            };
        case 'future':
            return {
                ...baseStyles,
                card: "bg-[#0b1622]/90 backdrop-blur-md border border-[#1271ff]/40 p-4 shadow-[0_0_30px_rgba(18,113,255,0.2)]",
                highlight: "bg-[#1271ff]/20 border border-[#1271ff]",
                textPrimary: "font-black text-white",
                textSecondary: "text-[#7db8ff] text-sm",
                textTertiary: "text-blue-200/80 text-xs",
            };
        case 'glass':
            return {
                ...baseStyles,
                // Premium Dark Glass Card
                card: "bg-[#0a0a0a]/60 backdrop-blur-2xl border border-[#27272a]/40 p-5 rounded-[24px] shadow-2xl",
                // The "Awesome Button" design (Solid Neon Green Pill)
                highlight: "bg-[#07fc03] text-black border-none shadow-[0_0_20px_rgba(7,252,3,0.4)]",
                textPrimary: "font-black tracking-tight text-white",
                textSecondary: "text-zinc-300 text-sm font-medium",
                textTertiary: "text-zinc-400 text-xs font-bold uppercase tracking-wider",
            };
        case 'neon':
            return {
                ...baseStyles,
                card: "bg-black/85 border border-white/10 p-4 shadow-[0_0_15px_#9146FF] rounded-xl",
                highlight: "bg-[#9146FF] shadow-[0_0_10px_#9146FF]",
                textPrimary: "font-black text-white",
                textSecondary: "text-[#e8d4ff] text-sm",
                textTertiary: "text-zinc-200 text-xs",
            };
        case 'minimal':
            return {
                ...baseStyles,
                card: "bg-black/90 p-4 rounded-lg",
                highlight: "border-l-4 border-white pl-4",
                textPrimary: "font-medium text-white",
                textSecondary: "text-zinc-200 text-sm",
                textTertiary: "text-zinc-300 text-xs",
            };
        case 'bold':
            return {
                ...baseStyles,
                card: "bg-black/95 border-4 border-white p-4",
                highlight: "bg-white text-black",
                textPrimary: "font-black text-white",
                textSecondary: "text-zinc-300 text-sm font-bold",
                textTertiary: "text-zinc-400 text-xs font-bold",
            };
        case 'classic':
        default:
            return {
                ...baseStyles,
                card: "bg-[#18181b]/80 backdrop-blur-xl border border-[#27272a]/30 p-5 rounded-[20px] shadow-xl",
                highlight: "bg-[#07fc03]/10 border border-[#07fc03]/30",
                textPrimary: "font-bold text-white tracking-tight",
                textSecondary: "text-zinc-300 text-sm",
                textTertiary: "text-zinc-400 text-xs font-semibold",
            };
    }
}
