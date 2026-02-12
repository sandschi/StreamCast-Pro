'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { doc, updateDoc, onSnapshot, setDoc } from 'firebase/firestore';
import {
    Settings as SettingsIcon,
    Save,
    User,
    Type,
    Layout,
    Image as ImageIcon,
    Move,
    Sparkles,
    Send
} from 'lucide-react';

const FONTS = [
    'Inter', 'Roboto', 'Poppins', 'Montserrat', 'Oswald',
    'Ubuntu', 'Raleway', 'Playfair Display', 'Bangers', 'Pacifico', 'Monoton'
];

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
    });

    const [twitchUsername, setTwitchUsername] = useState('');
    const [saving, setSaving] = useState(false);

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

    const sendTestOverlay = async () => {
        if (!effectiveUid) return;
        try {
            const testMessage = {
                id: 'test-message-' + Date.now(),
                username: 'TestUser',
                fragments: [{ type: 'text', content: 'This is a test message from your settings!' }],
                timestamp: Date.now(),
                color: '#FF0000', // Example color
                badges: [],
                avatarUrl: 'https://static-cdn.jtvnw.net/jtv_user_pictures/asmongold-profile_image-f7ddabea70191630-70x70.png' // Example avatar
            };
            await setDoc(doc(db, 'users', effectiveUid, 'active_message', 'current'), testMessage);
            console.log('Test overlay sent!');
        } catch (e) {
            console.error('Error sending test overlay:', e);
            alert('Error sending test overlay.');
        }
    };

    return (
        <div className="flex flex-col h-full bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
                        <SettingsIcon size={18} className="text-zinc-400" />
                        Overlay Customization
                    </h3>
                    <div className="h-4 w-px bg-zinc-800" />
                    <button
                        onClick={sendTestOverlay}
                        className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[11px] font-bold transition-all border border-zinc-700"
                    >
                        <Send size={12} />
                        Send Test Overlay
                    </button>
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm font-bold transition-all shadow-lg active:scale-95"
                >
                    <Save size={16} />
                    {saving ? 'Saving...' : 'Save Changes'}
                </button>
            </div>

            {/* Live Preview Section */}
            <div className="p-6 border-b border-zinc-800 bg-zinc-950">
                <h4 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Sparkles size={14} />
                    Live Preview
                </h4>
                <div
                    className="relative w-full h-64 bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden"
                    style={{ fontFamily: `'${settings.fontFamily}', sans-serif` }}
                >
                    {/* Preview Message Bubble */}
                    <div
                        className="absolute flex items-start gap-3"
                        style={{
                            left: `${settings.posX}%`,
                            top: `${settings.posY}%`,
                            transform: 'translate(-50%, -50%)'
                        }}
                    >
                        {/* Avatar */}
                        {settings.showAvatar && (
                            <img
                                src="https://static-cdn.jtvnw.net/jtv_user_pictures/asmongold-profile_image-f7ddabea70191630-70x70.png"
                                alt=""
                                className="rounded-full border-2 border-white/10"
                                style={{
                                    width: `${settings.avatarSize}px`,
                                    height: `${settings.avatarSize}px`
                                }}
                            />
                        )}

                        {/* Message Content */}
                        <div
                            className="flex flex-col gap-1"
                            style={{ borderRadius: `${settings.borderRadius}px` }}
                        >
                            {/* Username */}
                            <div
                                className="px-3 py-1 font-bold"
                                style={{
                                    fontSize: `${settings.nameSize}px`,
                                    color: settings.textColor,
                                    backgroundColor: settings.bubbleStyle === 'minimal' ? 'transparent' : 'rgba(147, 51, 234, 0.8)',
                                    borderRadius: `${settings.borderRadius}px ${settings.borderRadius}px 0 0`,
                                    borderBottom: settings.bubbleStyle === 'classic' ? '1px solid rgba(255,255,255,0.1)' : 'none'
                                }}
                            >
                                TestUser
                            </div>

                            {/* Message Text */}
                            <div
                                className="px-3 py-2"
                                style={{
                                    fontSize: `${settings.fontSize}px`,
                                    color: settings.textColor,
                                    backgroundColor: settings.bubbleStyle === 'glass' ? 'rgba(255,255,255,0.1)' :
                                        settings.bubbleStyle === 'neon' ? 'rgba(0,0,0,0.9)' :
                                            settings.bubbleStyle === 'minimal' ? 'transparent' :
                                                'rgba(0,0,0,0.6)',
                                    backdropFilter: settings.bubbleStyle === 'glass' ? 'blur(12px)' : 'none',
                                    border: settings.bubbleStyle === 'neon' ? '1px solid rgb(147, 51, 234)' :
                                        settings.bubbleStyle === 'glass' ? '1px solid rgba(255,255,255,0.05)' : 'none',
                                    boxShadow: settings.bubbleStyle === 'neon' ? '0 0 10px rgba(147, 51, 234, 0.5)' : 'none',
                                    borderRadius: `0 0 ${settings.borderRadius}px ${settings.borderRadius}px`
                                }}
                            >
                                This is a preview message! 🎉
                            </div>
                        </div>
                    </div>
                </div>
                <p className="text-xs text-zinc-600 mt-2 italic">Preview updates in real-time as you adjust settings below</p>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-10 scrollbar-hide">
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
                    <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
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
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-zinc-200 outline-none"
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
                            <label className="text-xs font-bold text-zinc-400 uppercase flex justify-between">Message Text Size <span>{settings.fontSize}px</span></label>
                            <input type="range" min="12" max="80" value={settings.fontSize} onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))} className="w-full accent-purple-600" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-400 uppercase flex justify-between">Username Size <span>{settings.nameSize}px</span></label>
                            <input type="range" min="8" max="40" value={settings.nameSize} onChange={(e) => updateSetting('nameSize', parseInt(e.target.value))} className="w-full accent-purple-600" />
                        </div>
                    </div>
                </section>

                {/* 3. Avatar Styling */}
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

                {/* 4. Precision Positioning */}
                <section className="space-y-6">
                    <h4 className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2">
                        <Move size={14} /> Precision Positioning (X,Y)
                    </h4>
                    <div className="grid grid-cols-2 gap-8 bg-zinc-800/20 p-6 rounded-2xl border border-white/5">
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-400 uppercase block">Horizontal (X) <span className="ml-2 text-purple-500">{settings.posX}%</span></label>
                                <input type="range" min="0" max="100" value={settings.posX} onChange={(e) => updateSetting('posX', parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-600" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-zinc-400 uppercase block">Vertical (Y) <span className="ml-2 text-purple-500">{settings.posY}%</span></label>
                                <input type="range" min="0" max="100" value={settings.posY} onChange={(e) => updateSetting('posY', parseInt(e.target.value))} className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-purple-600" />
                            </div>
                        </div>

                        {/* Visual XY Indicator */}
                        <div className="relative aspect-video bg-zinc-950 rounded-lg border border-zinc-700 overflow-hidden flex items-center justify-center">
                            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)', backgroundSize: '20% 20%' }} />
                            <div
                                className="absolute w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                                style={{
                                    left: `${settings.posX}%`,
                                    top: `${settings.posY}%`,
                                    transform: 'translate(-50%, -50%)',
                                    transition: 'all 0.1s ease-out'
                                }}
                            />
                            <span className="text-[10px] font-bold text-zinc-700 select-none">PREVIEW GRID</span>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
