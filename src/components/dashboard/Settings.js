'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { doc, updateDoc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';
import {
    Settings as SettingsIcon,
    Save,
    User,
    Type,
    Layout,
    Image as ImageIcon,
    Move,
    Sparkles,
    Send,
    Volume2
} from 'lucide-react';

const FONTS = [
    'Inter', 'Roboto', 'Poppins', 'Montserrat', 'Oswald',
    'Ubuntu', 'Raleway', 'Playfair Display', 'Bangers', 'Pacifico', 'Monoton'
];

const SOUNDS = {
    pop: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3',
    ding: 'https://assets.mixkit.co/active_storage/sfx/2860/2860-preview.mp3',
    coin: 'https://assets.mixkit.co/active_storage/sfx/2000/2000-preview.mp3',
    notify: 'https://assets.mixkit.co/active_storage/sfx/1124/1124-preview.mp3',
    success: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3',
    chime: 'https://assets.mixkit.co/active_storage/sfx/2857/2857-preview.mp3',
    bloop: 'https://assets.mixkit.co/active_storage/sfx/2863/2863-preview.mp3',
    click: 'https://assets.mixkit.co/active_storage/sfx/2847/2847-preview.mp3',
    tone: 'https://assets.mixkit.co/active_storage/sfx/2861/2861-preview.mp3',
    note: 'https://assets.mixkit.co/active_storage/sfx/2858/2858-preview.mp3',
};

export default function Settings({ targetUid, isModeratorMode }) {
    const { user } = useAuth();
    const effectiveUid = targetUid || user?.uid;

    const [settings, setSettings] = useState({
        textColor: '#ffffff',
        strokeColor: '#000000',
        fontSize: 24,
        nameSize: 16,
        avatarSize: 40,
        fontFamily: 'Inter',
        animationStyle: 'slide',
        displayDuration: 5,
        borderRadius: 12,
        posX: 5, // Percentage from left
        posY: 90, // Percentage from top
        showAvatar: true,
        bubbleStyle: 'classic', // Added bubbleStyle
        soundEnabled: false,
        soundType: 'pop',
        soundVolume: 0.5,
    });

    const [twitchUsername, setTwitchUsername] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!settings.fontFamily) return;
        const link = document.createElement('link');
        const fontName = settings.fontFamily.replace(/\s+/g, '+');
        link.href = `https://fonts.googleapis.com/css2?family=${fontName}:wght@400;700;900&display=swap`;
        link.rel = 'stylesheet';
        link.onerror = () => console.warn(`Failed to load font: ${settings.fontFamily}`);
        document.head.appendChild(link);
        return () => { try { document.head.removeChild(link); } catch (e) { } };
    }, [settings.fontFamily]);

    useEffect(() => {
        if (!effectiveUid) return;
        const configRef = doc(db, 'users', effectiveUid, 'settings', 'config');
        const unsubscribeConfig = onSnapshot(configRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                // Migration: If old positionVertical/Horizontal exists, map them to percentages
                if (!data.posX && data.positionHorizontal) {
                    data.posX = data.positionHorizontal === 'right' ? 95 : data.positionHorizontal === 'center' ? 50 : 5;
                    data.posY = data.positionVertical === 'top' ? 5 : data.positionVertical === 'center' ? 50 : 90;
                }
                setSettings(prev => ({ ...prev, ...data }));
            }
        });
        const userRef = doc(db, 'users', effectiveUid);
        const unsubscribeUser = onSnapshot(userRef, (doc) => {
            if (doc.exists()) setTwitchUsername(doc.data().twitchUsername || '');
        });
        return () => { unsubscribeConfig(); unsubscribeUser(); };
    }, [effectiveUid]);

    const updateSetting = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

    const [activeMessage, setActiveMessage] = useState(null);

    useEffect(() => {
        if (!effectiveUid) return;
        const msgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
        const unsub = onSnapshot(msgRef, (doc) => {
            setActiveMessage(doc.exists() ? doc.data() : null);
        });
        return () => unsub();
    }, [effectiveUid]);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'users', effectiveUid, 'settings', 'config'), settings);
            await updateDoc(doc(db, 'users', effectiveUid), { twitchUsername: twitchUsername.toLowerCase().trim() });
        } catch (e) {
            console.error(e);
            alert('Error saving. Check Firestore connection.');
        } finally { setSaving(false); }
    };

    const sendTestOverlay = async (permanent = false) => {
        if (!effectiveUid) return;
        try {
            const testMessage = {
                id: 'test-message-' + Date.now(),
                username: 'TestUser',
                fragments: [{ type: 'text', content: permanent ? 'This message will stay until hidden! 📌' : 'This is a test message from your settings!' }],
                timestamp: Date.now(),
                color: '#FF0000',
                badges: [],
                avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/asmongold-profile_image-f7ddabea70191630-70x70.png',
                settings: settings // Include current settings for preview
            };

            if (permanent) {
                testMessage.duration = -1;
            }
            await setDoc(doc(db, 'users', effectiveUid, 'active_message', 'current'), testMessage);
            console.log('Test overlay sent!');
        } catch (e) {
            console.error('Error sending test overlay:', e);
            alert('Error sending test overlay.');
        }
    };

    const hideOverlay = async () => {
        if (!effectiveUid) return;
        try {
            await deleteDoc(doc(db, 'users', effectiveUid, 'active_message', 'current')); // Clear message
        } catch (e) {
            console.error("Error hiding overlay:", e);
        }
    };

    return (
        <div className="relative">
            {/* Floating Controls - Fixed position to ensure they always stay on screen */}
            {/* Fixed Control Center: Preview + Actions */}
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-3 w-full max-w-md pointer-events-none">

                {/* 1. Live Preview (Pointer Events Auto) */}
                <div className="pointer-events-auto bg-zinc-900/90 backdrop-blur-xl p-3 rounded-2xl border border-zinc-700/50 shadow-2xl animate-in slide-in-from-top-4 duration-500 w-full max-w-[320px]">
                    <div className="flex justify-between items-center mb-2 px-1">
                        <h4 className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2">
                            <Sparkles size={12} /> Live Preview
                        </h4>
                        <div className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full">
                            Interactive
                        </div>
                    </div>

                    <div
                        className="relative w-full aspect-[2.5/1] bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden shadow-inner flex items-center justify-center p-4 bg-[radial-gradient(#333_1px,transparent_1px)] [background-size:16px_16px]"
                        style={{ fontFamily: `'${settings.fontFamily}', sans-serif` }}
                    >
                        {/* Preview Message Bubble (Centered in preview box, scaling down if needed) */}
                        <div className="scale-90 origin-center flex items-center justify-center">
                            <div
                                className="flex items-start gap-3 w-max max-w-full"
                                style={{
                                    // For the preview BOX, we just center it nicely. The "settings.posX/Y" affects the REAL overlay.
                                    // Here we just show what it LOOKS like.
                                }}
                            >
                                {/* Avatar */}
                                {settings.showAvatar && (
                                    <img
                                        src="https://static-cdn.jtvnw.net/jtv_user_pictures/asmongold-profile_image-f7ddabea70191630-70x70.png"
                                        alt=""
                                        className="rounded-full border-2 border-white/10 shadow-lg"
                                        style={{
                                            width: `${settings.avatarSize}px`,
                                            height: `${settings.avatarSize}px`
                                        }}
                                    />
                                )}

                                {/* Message Content */}
                                <div
                                    className="flex flex-col gap-1 shadow-2xl"
                                    style={{ borderRadius: `${settings.borderRadius}px` }}
                                >
                                    {/* Username */}
                                    <div
                                        className="px-3 py-1 font-bold truncate"
                                        style={{
                                            fontSize: `${settings.nameSize}px`,
                                            color: settings.textColor,
                                            backgroundColor: settings.bubbleStyle === 'minimal' ? 'transparent' : 'rgba(147, 51, 234, 0.9)',
                                            borderRadius: `${settings.borderRadius}px ${settings.borderRadius}px 0 0`,
                                            borderBottom: settings.bubbleStyle === 'classic' ? '1px solid rgba(255,255,255,0.1)' : 'none'
                                        }}
                                    >
                                        PreviewUser
                                    </div>

                                    {/* Message Text */}
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

                {/* 2. Floating Buttons (Pointer Events Auto) */}
                <div className="pointer-events-auto flex items-center gap-3 bg-zinc-900/90 p-2 rounded-full border border-zinc-700/50 backdrop-blur-md shadow-2xl transition-all">
                    {/* Hide Button (Only for Mods/Owner when Active) */}
                    {activeMessage && (user?.uid === effectiveUid || isModeratorMode) && (
                        <>
                            <button
                                onClick={hideOverlay}
                                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-200 rounded-full text-xs font-bold transition-all border border-red-500/30 animate-in fade-in zoom-in duration-200"
                            >
                                <span className="hidden sm:inline">Hide</span>
                                <span className="sm:hidden">X</span>
                            </button>
                            <div className="w-px h-4 bg-zinc-700" />
                        </>
                    )}

                    <button
                        onClick={() => sendTestOverlay(false)}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-full text-xs font-bold transition-all border border-zinc-600 shadow-sm"
                    >
                        <Send size={14} />
                        <span className="hidden sm:inline">Test</span>
                    </button>
                    <button
                        onClick={() => sendTestOverlay(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-full text-xs font-bold transition-all border border-zinc-600 shadow-sm"
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
                        className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-500 rounded-full text-sm font-bold transition-all shadow-lg shadow-purple-900/20 active:scale-95 text-white"
                    >
                        <Save size={18} />
                        {saving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>

            {/* Header Title (Standard Flow) */}
            <div className="mb-8 p-1">
                <h3 className="text-2xl font-bold text-zinc-100 flex items-center gap-3">
                    <SettingsIcon size={24} className="text-purple-500" />
                    Overlay Customization
                </h3>
                <p className="text-zinc-500 text-sm mt-1 ml-9">Configure your stream overlay appearance and behavior.</p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 pt-48">
                {/* Visual Settings Column */}
                <div className="flex-1 space-y-10">

                    {/* 1. Identity */}
                    <section className="space-y-4">
                        <h4 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                            <User size={14} /> Twitch Identity
                        </h4>
                        <input
                            type="text"
                            placeholder="Twitch Channel Name"
                            value={twitchUsername}
                            onChange={(e) => setTwitchUsername(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700/50 rounded-xl px-4 py-3 text-zinc-100 outline-none focus:ring-2 focus:ring-purple-600 transition-all font-medium"
                        />
                    </section>

                    {/* 2. Overlay Visual Style */}
                    <section className="space-y-4">
                        <h4 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                            <Sparkles size={14} /> Overlay Visual Style
                        </h4>
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
                                <button
                                    key={style.id}
                                    onClick={() => updateSetting('bubbleStyle', style.id)}
                                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${settings.bubbleStyle === style.id
                                        ? 'bg-purple-600/10 border-purple-500 text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-500 hover:border-zinc-600'
                                        }`}
                                >
                                    <div className={`w-8 h-4 rounded-sm relative overflow-hidden ${style.id === 'classic' ? 'bg-zinc-700 border border-white/20' :
                                        style.id === 'glass' ? 'bg-white/10 backdrop-blur-sm border border-white/20' :
                                            style.id === 'neon' ? 'bg-zinc-950 border border-purple-500 shadow-[0_0_5px_purple]' :
                                                style.id === 'minimal' ? 'border-none bg-transparent' :
                                                    style.id === 'cyberpunk' ? 'bg-zinc-900 border-l-2 border-l-[#ff003c] border-r-2 border-r-[#00f0ff]' :
                                                        style.id === 'comic' ? 'bg-white border-2 border-black after:content-[""] after:absolute after:inset-0 after:bg-[radial-gradient(#000_15%,transparent_16%)] after:bg-[length:3px_3px]' :
                                                            style.id === 'retro' ? 'bg-zinc-900 border-2 border-white' :
                                                                style.id === 'future' ? 'bg-zinc-900 border border-blue-500/30 after:content-[""] after:absolute after:inset-0 after:bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,128,255,0.1)_50%)] after:bg-[length:100%_2px]' :
                                                                    'bg-white border-2 border-black'
                                        }`} />
                                    <span className="text-[10px] font-bold uppercase tracking-tighter">{style.label}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* 3. Typography & Colors */}
                    <section className="space-y-6">
                        <h4 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                            <Type size={14} /> Typography & Colors
                        </h4>

                        <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase">Font Family</label>
                                <select
                                    value={settings.fontFamily}
                                    onChange={(e) => updateSetting('fontFamily', e.target.value)}
                                    className="w-full bg-zinc-800 border border-zinc-700/50 rounded-xl px-3 py-2.5 text-zinc-200 outline-none"
                                >
                                    {FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase">Text Color</label>
                                <div className="flex gap-2">
                                    <input type="color" value={settings.textColor} onChange={(e) => updateSetting('textColor', e.target.value)} className="w-10 h-10 rounded-lg bg-zinc-800 border-none cursor-pointer" />
                                    <input type="text" value={settings.textColor} readOnly className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 text-[10px] text-zinc-500 uppercase font-mono" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase flex justify-between">
                                    Display Duration <span>{settings.displayDuration}s</span>
                                </label>
                                <input
                                    type="range"
                                    min="3"
                                    max="60"
                                    value={settings.displayDuration}
                                    onChange={(e) => updateSetting('displayDuration', parseInt(e.target.value))}
                                    className="w-full accent-purple-600"
                                />
                                <p className="text-[10px] text-zinc-600 italic">How long the message stays on screen (in seconds).</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase flex justify-between">Message Text Size <span>{settings.fontSize}px</span></label>
                                <input type="range" min="12" max="80" value={settings.fontSize} onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))} className="w-full accent-purple-600" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase flex justify-between">Username Size <span>{settings.nameSize}px</span></label>
                                <input type="range" min="8" max="40" value={settings.nameSize} onChange={(e) => updateSetting('nameSize', parseInt(e.target.value))} className="w-full accent-purple-600" />
                            </div>
                        </div>
                    </section>

                    {/* 4. Avatar Styling */}
                    <section className="space-y-4">
                        <h4 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                            <ImageIcon size={14} /> Avatar Configuration
                        </h4>
                        <div className="flex items-center justify-between p-4 bg-zinc-800/20 rounded-2xl border border-white/5">
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-zinc-200">Enable Profile Pictures</p>
                                <p className="text-xs text-zinc-500 italic">Show the sender's circular avatar next to their name.</p>
                            </div>
                            <button
                                onClick={() => updateSetting('showAvatar', !settings.showAvatar)}
                                className={`w-14 h-7 rounded-full transition-all relative p-1 ${settings.showAvatar ? 'bg-purple-600' : 'bg-zinc-700'}`}
                            >
                                <div className={`w-5 h-5 bg-white rounded-full transition-all flex items-center justify-center ${settings.showAvatar ? 'translate-x-[1.75rem]' : 'translate-x-0'}`} />
                            </button>
                        </div>
                        {settings.showAvatar && (
                            <div className="space-y-2 pl-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase flex justify-between">Avatar Diameter <span>{settings.avatarSize}px</span></label>
                                <input type="range" min="20" max="120" value={settings.avatarSize} onChange={(e) => updateSetting('avatarSize', parseInt(e.target.value))} className="w-full accent-purple-600" />
                                <p className="text-[10px] text-zinc-600 italic">Tip: Setting this close to text size creates a modern inline look.</p>
                            </div>
                        )}
                    </section>

                    {/* 5. Precision Positioning */}
                    <section className="space-y-6">
                        <h4 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                            <Move size={14} /> Precision Positioning (X,Y)
                        </h4>
                        <div className="space-y-4 bg-zinc-800/20 p-6 rounded-2xl border border-white/5">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-400 uppercase block">Horizontal (X) <span className="ml-2 text-purple-500">{settings.posX}%</span></label>
                                <input type="range" min="0" max="100" value={settings.posX} onChange={(e) => updateSetting('posX', parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-600" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-400 uppercase block">Vertical (Y) <span className="ml-2 text-purple-500">{settings.posY}%</span></label>
                                <input type="range" min="0" max="100" value={settings.posY} onChange={(e) => updateSetting('posY', parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-600" />
                            </div>
                        </div>
                    </section>

                    {/* 6. Sound Effects */}
                    <section className="space-y-4">
                        <h4 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                            <Volume2 size={14} /> Sound Effects
                        </h4>
                        <div className="flex items-center justify-between p-4 bg-zinc-800/20 rounded-2xl border border-white/5">
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-zinc-200">Enable Sound</p>
                                <p className="text-xs text-zinc-500 italic">Play a sound when a message appears.</p>
                            </div>
                            <button
                                onClick={() => updateSetting('soundEnabled', !settings.soundEnabled)}
                                className={`w-14 h-7 rounded-full transition-all relative p-1 ${settings.soundEnabled ? 'bg-purple-600' : 'bg-zinc-700'}`}
                            >
                                <div className={`w-5 h-5 bg-white rounded-full transition-all flex items-center justify-center ${settings.soundEnabled ? 'translate-x-[1.75rem]' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        {settings.soundEnabled && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pl-2 animate-in slide-in-from-top-2 duration-300">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-400 uppercase">Sound Type</label>
                                    <select
                                        value={settings.soundType || 'pop'}
                                        onChange={(e) => {
                                            updateSetting('soundType', e.target.value);
                                            // Play preview
                                            const audio = new Audio(SOUNDS[e.target.value]);
                                            audio.volume = (settings.soundVolume !== undefined ? settings.soundVolume : 0.5);
                                            audio.play().catch(e => console.error(e));
                                        }}
                                        className="w-full bg-zinc-800 border border-zinc-700/50 rounded-xl px-3 py-2.5 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-600/50 transition-all"
                                    >
                                        <option value="pop">Pop</option>
                                        <option value="ding">Ding</option>
                                        <option value="coin">Coin</option>
                                        <option value="notify">Notify</option>
                                        <option value="success">Success</option>
                                        <option value="chime">Chime (Subtle)</option>
                                        <option value="bloop">Bloop (Subtle)</option>
                                        <option value="click">Click (Subtle)</option>
                                        <option value="tone">Tone (Subtle)</option>
                                        <option value="note">Note (Subtle)</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-400 uppercase flex justify-between">
                                        Volume <span>{Math.round((settings.soundVolume !== undefined ? settings.soundVolume : 0.5) * 100)}%</span>
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={settings.soundVolume !== undefined ? settings.soundVolume : 0.5}
                                        onChange={(e) => {
                                            const vol = parseFloat(e.target.value);
                                            updateSetting('soundVolume', vol);
                                        }}
                                        onMouseUp={() => {
                                            const audio = new Audio(SOUNDS[settings.soundType || 'pop']);
                                            audio.volume = (settings.soundVolume !== undefined ? settings.soundVolume : 0.5);
                                            audio.play().catch(e => console.error(e));
                                        }}
                                        className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-600"
                                    />
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
}
