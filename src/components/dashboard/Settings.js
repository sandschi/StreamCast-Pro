'use client';

import Image from 'next/image';
import { useAuth } from '@/context/AuthContext';
import { useSettingsData, SOUNDS } from '@/hooks/useSettingsData';
import {
    Settings as SettingsIcon,
    Save,
    User,
    Type,
    Image as ImageIcon,
    Move,
    Sparkles,
    Send,
    Volume2,
    Music,
    XCircle
} from 'lucide-react';
import SectionLabel from '@/components/ui/SectionLabel';
import TextInput from '@/components/ui/TextInput';
import Select from '@/components/ui/Select';
import RangeSlider from '@/components/ui/RangeSlider';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import StyleTile from '@/components/ui/StyleTile';

const FONTS = [
    'Inter', 'Roboto', 'Poppins', 'Montserrat', 'Oswald',
    'Ubuntu', 'Raleway', 'Playfair Display', 'Bangers', 'Pacifico', 'Monoton'
];

export default function Settings({ targetUid, isModeratorMode }) {
    const { user } = useAuth();
    const {
        effectiveUid, settings, updateSetting,
        twitchUsername, setTwitchUsername, saving, activeMessage,
        handleSave, sendTestOverlay, hideOverlay,
    } = useSettingsData({ targetUid, isModeratorMode });

    return (
        <div className="relative flex flex-col h-full">

            {/* Centered Fixed Live Preview */}
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-[95%] max-w-[500px] pointer-events-none">
                <div className="pointer-events-auto bg-zinc-900/90 backdrop-blur-xl p-3 rounded-2xl border border-zinc-700/50 shadow-2xl animate-in slide-in-from-top-4 duration-500 w-full">
                    <div className="flex justify-between items-center mb-2 px-1">
                        <h4 className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                            <Sparkles size={12} /> Live Preview
                        </h4>
                        <div className="text-[10px] bg-primary-500 text-black font-black uppercase px-2 py-0.5 rounded-full shadow-[0_0_10px_rgba(7,252,3,0.3)]">
                            Live Preview
                        </div>
                    </div>

                    <div
                        className="relative w-full aspect-[2.5/1] bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden shadow-inner flex items-center justify-center p-4 bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px]"
                        style={{ fontFamily: `'${settings.fontFamily}', sans-serif` }}
                    >
                        <div className="scale-90 origin-center flex items-center justify-center">
                            <div className="flex items-start gap-3 w-max max-w-full">
                                {settings.showAvatar && (
                                    <div
                                        className="relative overflow-hidden rounded-full border-2 border-white/10 shadow-lg shrink-0"
                                        style={{
                                            width: `${settings.avatarSize}px`,
                                            height: `${settings.avatarSize}px`
                                        }}
                                    >
                                        <Image
                                            src={user?.photoURL || "https://static-cdn.jtvnw.net/user-default-pictures-uv/cdd517fe-def4-11e9-948e-784f43822e80-profile_image-300x300.png"}
                                            alt="Preview Avatar"
                                            fill
                                            style={{ objectFit: 'cover' }}
                                        />
                                    </div>
                                )}

                                <div className="flex flex-col gap-1 shadow-2xl" style={{ borderRadius: `${settings.borderRadius}px` }}>
                                    <div
                                        className="px-3 py-1 font-bold truncate"
                                        style={{
                                            fontSize: `${settings.nameSize}px`,
                                            color: '#ffffff',
                                            backgroundColor: settings.bubbleStyle === 'minimal' ? 'transparent' : 'rgba(147, 51, 234, 0.9)',
                                            borderRadius: `${settings.borderRadius}px ${settings.borderRadius}px 0 0`,
                                            borderBottom: settings.bubbleStyle === 'classic' ? '1px solid rgba(255,255,255,0.1)' : 'none'
                                        }}
                                    >
                                        {user?.displayName || 'PreviewUser'}
                                    </div>

                                    <div
                                        className="px-3 py-2"
                                        style={{
                                            fontSize: `${settings.fontSize}px`,
                                            color: settings.textColor,
                                            backgroundColor: settings.bubbleStyle === 'glass' ? 'rgba(255,255,255,0.1)' :
                                                settings.bubbleStyle === 'neon' ? 'rgba(0,0,0,0.95)' :
                                                    settings.bubbleStyle === 'minimal' ? 'transparent' :
                                                        'rgba(0,0,0,0.7)',
                                            backdropFilter: settings.bubbleStyle === 'glass' ? 'blur(16px)' : 'none',
                                            border: settings.bubbleStyle === 'neon' ? '1px solid rgb(147, 51, 234)' :
                                                settings.bubbleStyle === 'glass' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                                            boxShadow: settings.bubbleStyle === 'neon' ? '0 0 15px rgba(147, 51, 234, 0.6)' : 'none',
                                            borderRadius: `0 0 ${settings.borderRadius}px ${settings.borderRadius}px`
                                        }}
                                    >
                                        Settings looks good! ✨
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Inline Header & Actions Row */}
            <div className="flex flex-col xl:flex-row justify-between items-start gap-8 mb-8 p-1 relative z-10 w-full mt-4 md:mt-0 xl:mt-4">
                <div>
                    <h3 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
                        <SettingsIcon size={24} className="text-primary-500" />
                        Overlay Customization
                    </h3>
                    <p className="text-zinc-500 mt-2 text-sm max-w-sm">Build your perfect aesthetic. Changes preview instantly and apply to all displays.</p>
                </div>

                {/* Top-Right Action Buttons */}
                <div className="flex items-center gap-3 bg-zinc-900/90 p-2 rounded-full border border-zinc-700/50 shadow-2xl shrink-0 transition-all">
                    {/* Hide Button (Only for Mods/Owner when Active) */}
                    {activeMessage && (user?.uid === effectiveUid || isModeratorMode) && (
                        <>
                            <button
                                onClick={hideOverlay}
                                className="btn-awesome !bg-zinc-800 !text-white !shadow-none hover:!bg-zinc-700 active:scale-95 animate-in fade-in"
                            >
                                <XCircle size={14} />
                                Hide Overlay
                            </button>
                            <div className="w-px h-4 bg-zinc-700" />
                        </>
                    )}

                    <button
                        onClick={() => sendTestOverlay(false)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-full text-xs font-bold transition-all border border-zinc-600 shadow-sm"
                    >
                        <Send size={14} />
                        <span className="hidden sm:inline">Test</span>
                    </button>
                    <button
                        onClick={() => sendTestOverlay(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-full text-xs font-bold transition-all border border-zinc-600 shadow-sm"
                        title="Send Permanent Message"
                    >
                        <Send size={14} />
                        <span className="hidden sm:inline">Send ∞</span>
                        <span className="sm:hidden">∞</span>
                    </button>
                    <div className="w-px h-4 bg-zinc-700" />
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="btn-awesome min-w-[160px]"
                    >
                        <Save size={16} />
                        {saving ? 'Saving...' : 'SAVE SETTINGS'}
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-12 pb-32">
                {/* Visual Settings Column */}
                <div className="space-y-12">

                    {/* 1. Identity */}
                    <section className="space-y-4">
                        <SectionLabel icon={<User size={14} />}>Twitch Identity</SectionLabel>
                        <TextInput
                            placeholder="Twitch Channel Name"
                            value={twitchUsername}
                            onChange={setTwitchUsername}
                        />
                    </section>

                    {/* 2. Overlay Visual Style */}
                    <section className="space-y-4">
                        <SectionLabel icon={<Sparkles size={14} />}>Overlay Visual Style</SectionLabel>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                            {[
                                { id: 'classic', label: 'Classic' },
                                { id: 'glass', label: 'Glass' },
                                { id: 'neon', label: 'Neon' },
                                { id: 'minimal', label: 'Minimal' },
                                { id: 'bold', label: 'Bold' },
                                { id: 'cyberpunk', label: 'Cyber' },
                                { id: 'comic', label: 'Comic' },
                                { id: 'retro', label: 'Retro' },
                                { id: 'future', label: 'Future' }
                            ].map((style) => (
                                <StyleTile
                                    key={style.id}
                                    id={style.id}
                                    label={style.label}
                                    selected={settings.bubbleStyle === style.id}
                                    onClick={() => updateSetting('bubbleStyle', style.id)}
                                />
                            ))}
                        </div>
                    </section>

                    {/* 3. Typography & Colors */}
                    <section className="space-y-6">
                        <SectionLabel icon={<Type size={14} />}>Typography & Colors</SectionLabel>

                        <div className="grid grid-cols-2 gap-6">
                            <Select label="Font Family" value={settings.fontFamily} options={FONTS} onChange={(v) => updateSetting('fontFamily', v)} />
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase">Text Color</label>
                                <div className="flex gap-2">
                                    <input type="color" value={settings.textColor} onChange={(e) => updateSetting('textColor', e.target.value)} className="w-10 h-10 rounded-lg bg-zinc-800 border-none cursor-pointer" />
                                    <input type="text" value={settings.textColor} readOnly className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 text-[10px] text-zinc-500 uppercase font-mono" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <RangeSlider
                                label="Display Duration"
                                min={3} max={60}
                                value={settings.displayDuration}
                                unit="s"
                                onChange={(v) => updateSetting('displayDuration', v)}
                                hint="How long the message stays on screen (in seconds)."
                            />
                            <RangeSlider
                                label="Message Text Size"
                                min={12} max={80}
                                value={settings.fontSize}
                                unit="px"
                                onChange={(v) => updateSetting('fontSize', v)}
                            />
                            <RangeSlider
                                label="Username Size"
                                min={8} max={40}
                                value={settings.nameSize}
                                unit="px"
                                onChange={(v) => updateSetting('nameSize', v)}
                            />
                        </div>
                    </section>

                    {/* 4. Avatar Styling */}
                    <section className="space-y-4">
                        <SectionLabel icon={<ImageIcon size={14} />}>Avatar Configuration</SectionLabel>
                        <ToggleSwitch
                            label="Enable Profile Pictures"
                            description="Show the sender's circular avatar next to their name."
                            checked={settings.showAvatar}
                            onChange={(v) => updateSetting('showAvatar', v)}
                        />
                        {settings.showAvatar && (
                            <div className="pl-2">
                                <RangeSlider
                                    label="Avatar Diameter"
                                    min={20} max={120}
                                    value={settings.avatarSize}
                                    unit="px"
                                    onChange={(v) => updateSetting('avatarSize', v)}
                                    hint="Tip: Setting this close to text size creates a modern inline look."
                                />
                            </div>
                        )}
                    </section>

                    {/* 5. Precision Positioning */}
                    <section className="space-y-6">
                        <SectionLabel icon={<Move size={14} />}>Precision Positioning (X,Y)</SectionLabel>
                        <div className="space-y-4 bg-zinc-800/20 p-6 rounded-2xl border border-white/5">
                            <RangeSlider label="Horizontal (X)" value={settings.posX} unit="%" valueTone="accent" onChange={(v) => updateSetting('posX', v)} />
                            <RangeSlider label="Vertical (Y)" value={settings.posY} unit="%" valueTone="accent" onChange={(v) => updateSetting('posY', v)} />
                        </div>
                    </section>

                    {/* 6. Sound Effects */}
                    <section className="space-y-4">
                        <SectionLabel icon={<Volume2 size={14} />}>Sound Effects</SectionLabel>
                        <ToggleSwitch
                            label="Enable Sound"
                            description="Play a sound when a message appears."
                            checked={settings.soundEnabled}
                            onChange={(v) => updateSetting('soundEnabled', v)}
                        />

                        {settings.soundEnabled && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pl-2 animate-in slide-in-from-top-2 duration-300">
                                <Select
                                    label="Sound Type"
                                    value={settings.soundType || 'pop'}
                                    options={[
                                        { value: 'pop', label: 'Pop' },
                                        { value: 'ding', label: 'Ding' },
                                        { value: 'coin', label: 'Coin' },
                                        { value: 'notify', label: 'Notify' },
                                        { value: 'success', label: 'Success' },
                                        { value: 'chime', label: 'Chime (Subtle)' },
                                        { value: 'bloop', label: 'Bloop (Subtle)' },
                                        { value: 'click', label: 'Click (Subtle)' },
                                        { value: 'tone', label: 'Tone (Subtle)' },
                                        { value: 'note', label: 'Note (Subtle)' },
                                    ]}
                                    onChange={(v) => {
                                        updateSetting('soundType', v);
                                        // Play preview
                                        const audio = new Audio(SOUNDS[v]);
                                        audio.volume = (settings.soundVolume !== undefined ? settings.soundVolume : 0.5);
                                        audio.play().catch(e => console.error(e));
                                    }}
                                />
                                <RangeSlider
                                    label="Volume"
                                    min={0} max={1} step={0.05}
                                    value={settings.soundVolume !== undefined ? settings.soundVolume : 0.5}
                                    displayValue={Math.round((settings.soundVolume !== undefined ? settings.soundVolume : 0.5) * 100)}
                                    unit="%"
                                    onChange={(v) => updateSetting('soundVolume', v)}
                                    onMouseUp={() => {
                                        const audio = new Audio(SOUNDS[settings.soundType || 'pop']);
                                        audio.volume = (settings.soundVolume !== undefined ? settings.soundVolume : 0.5);
                                        audio.play().catch(e => console.error(e));
                                    }}
                                />
                            </div>
                        )}
                    </section>
                </div>

                {/* KaraFun Integration */}
                <div className="space-y-10 border-t border-zinc-800 pt-10">
                    <section className="space-y-4">
                        <SectionLabel icon={<Music size={14} />}>KaraFun Integration</SectionLabel>
                        <ToggleSwitch
                            label="Enable KaraFun"
                            description="Show song queue and current song in the sidebar."
                            checked={settings.karafunEnabled}
                            onChange={(v) => updateSetting('karafunEnabled', v)}
                        />
                    </section>
                </div>
            </div>
        </div>
    );
}
