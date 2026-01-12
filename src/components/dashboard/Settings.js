'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Settings as SettingsIcon, Save, User, Copy, Check, ExternalLink } from 'lucide-react';

export default function Settings({ targetUid, isModeratorMode }) {
    const { user } = useAuth();
    const effectiveUid = targetUid || user?.uid;
    const [settings, setSettings] = useState({
        textColor: '#ffffff',
        strokeColor: '#000000',
        fontSize: 24,
        animationStyle: 'slide',
        displayDuration: 5,
        borderRadius: 12,
        positionVertical: 'bottom',
        positionHorizontal: 'left',
        showAvatar: true,
    });
    const [twitchUsername, setTwitchUsername] = useState('');
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!effectiveUid) return;

        // Listen to settings
        const configRef = doc(db, 'users', effectiveUid, 'settings', 'config');
        const unsubscribeConfig = onSnapshot(configRef, (doc) => {
            if (doc.exists()) setSettings(doc.data());
        });

        // Listen to user doc for twitchUsername
        const userRef = doc(db, 'users', effectiveUid);
        const unsubscribeUser = onSnapshot(userRef, (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                setTwitchUsername(data.twitchUsername || '');
            }
        });

        return () => {
            unsubscribeConfig();
            unsubscribeUser();
        };
    }, [effectiveUid]);

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const configRef = doc(db, 'users', effectiveUid, 'settings', 'config');
            const userRef = doc(db, 'users', effectiveUid);

            await updateDoc(configRef, settings);
            await updateDoc(userRef, { twitchUsername: twitchUsername.toLowerCase().trim() });
        } catch (e) {
            console.error('Error saving settings:', e);
            alert('Error saving settings. Please check if your Ad-Blocker is blocking Firestore.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex flex-col h-[600px] bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                <h3 className="text-zinc-100 font-semibold flex items-center gap-2">
                    <SettingsIcon size={18} className="text-zinc-400" />
                    Overlay Settings
                </h3>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded text-sm font-medium transition-all"
                >
                    <Save size={14} />
                    {saving ? 'Saving...' : 'Save'}
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
                {/* User Identification */}
                <section className="space-y-4">
                    <h4 className="text-zinc-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                        <User size={14} /> Identity
                    </h4>
                    <div className="space-y-2">
                        <label className="text-sm text-zinc-300">Twitch Channel Name</label>
                        <input
                            type="text"
                            placeholder="e.g. shroud"
                            value={twitchUsername}
                            onChange={(e) => setTwitchUsername(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <p className="text-[11px] text-zinc-500 italic">This is the chat the dashboard will connect to. If your name didn't sync automatically, type it here.</p>
                    </div>
                </section>

                {/* Moderator Access */}
                {!isModeratorMode && (
                    <section className="space-y-4 pt-4 border-t border-zinc-800/50">
                        <h4 className="text-zinc-400 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                            <Copy size={14} /> Moderator Access
                        </h4>
                        <div className="space-y-3">
                            <p className="text-xs text-zinc-500">
                                Give this link to your moderators to let them manage your overlay from their own dashboard.
                            </p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}?host=${user?.uid}` : ''}
                                    className="flex-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-[11px] text-zinc-400 outline-none"
                                />
                                <button
                                    onClick={() => {
                                        const url = `${window.location.origin}${window.location.pathname}?host=${user?.uid}`;
                                        navigator.clipboard.writeText(url);
                                        setCopied(true);
                                        setTimeout(() => setCopied(false), 2000);
                                    }}
                                    className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${copied ? 'bg-green-600 text-white' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                                        }`}
                                >
                                    {copied ? <Check size={16} /> : <Copy size={16} />}
                                    {copied ? 'Copied' : 'Copy'}
                                </button>
                            </div>
                        </div>
                    </section>
                )}

                {/* Appearance */}
                <section className="space-y-4 pt-4 border-t border-zinc-800/50">
                    <h4 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Appearance</h4>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm text-zinc-300">Text Color</label>
                            <input
                                type="color"
                                value={settings.textColor}
                                onChange={(e) => updateSetting('textColor', e.target.value)}
                                className="w-full h-10 rounded bg-zinc-800 border border-zinc-700 cursor-pointer"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-zinc-300">Stroke Color</label>
                            <input
                                type="color"
                                value={settings.strokeColor}
                                onChange={(e) => updateSetting('strokeColor', e.target.value)}
                                className="w-full h-10 rounded bg-zinc-800 border border-zinc-700 cursor-pointer"
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm text-zinc-300 flex justify-between">
                            Font Size <span>{settings.fontSize}px</span>
                        </label>
                        <input
                            type="range"
                            min="12"
                            max="72"
                            value={settings.fontSize}
                            onChange={(e) => updateSetting('fontSize', parseInt(e.target.value))}
                            className="w-full accent-purple-500"
                        />
                    </div>
                </section>

                {/* Layout & Style */}
                <section className="space-y-4 pt-4 border-t border-zinc-800/50">
                    <h4 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Layout & Style</h4>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm text-zinc-300">Vertical Position</label>
                            <select
                                value={settings.positionVertical}
                                onChange={(e) => updateSetting('positionVertical', e.target.value)}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                <option value="top">Top</option>
                                <option value="center">Center</option>
                                <option value="bottom">Bottom</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm text-zinc-300">Horizontal Position</label>
                            <select
                                value={settings.positionHorizontal}
                                onChange={(e) => updateSetting('positionHorizontal', e.target.value)}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500"
                            >
                                <option value="left">Left</option>
                                <option value="center">Center</option>
                                <option value="right">Right</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm text-zinc-300 flex justify-between">
                            Roundness <span>{settings.borderRadius}px</span>
                        </label>
                        <input
                            type="range"
                            min="0"
                            max="50"
                            value={settings.borderRadius}
                            onChange={(e) => updateSetting('borderRadius', parseInt(e.target.value))}
                            className="w-full accent-purple-500"
                        />
                    </div>

                    <div className="flex items-center justify-between p-3 bg-zinc-800/30 rounded-lg border border-zinc-700/50">
                        <div className="space-y-0.5">
                            <label className="text-sm font-medium text-zinc-200">Show Chatter Avatars</label>
                            <p className="text-[11px] text-zinc-500 italic">Pull Twitch profile pics into the overlay.</p>
                        </div>
                        <button
                            onClick={() => updateSetting('showAvatar', !settings.showAvatar)}
                            className={`w-12 h-6 rounded-full transition-all relative ${settings.showAvatar ? 'bg-purple-600' : 'bg-zinc-700'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.showAvatar ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}
