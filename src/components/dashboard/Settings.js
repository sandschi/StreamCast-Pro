'use client';

import React, { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { Settings as SettingsIcon, Save } from 'lucide-react';

export default function Settings() {
    const { user } = useAuth();
    const [settings, setSettings] = useState({
        textColor: '#ffffff',
        strokeColor: '#000000',
        fontSize: 24,
        animationStyle: 'slide',
        displayDuration: 5,
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) return;

        const docRef = doc(db, 'users', user.uid, 'settings', 'config');
        const unsubscribe = onSnapshot(docRef, (doc) => {
            if (doc.exists()) {
                setSettings(doc.data());
            }
        });

        return () => unsubscribe();
    }, [user]);

    const updateSetting = (key, value) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const docRef = doc(db, 'users', user.uid, 'settings', 'config');
            await updateDoc(docRef, settings);
        } catch (e) {
            console.error('Error saving settings:', e);
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
                {/* Text Styling */}
                <section className="space-y-4">
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

                {/* Animation & Timing */}
                <section className="space-y-4 pt-4 border-t border-zinc-800/50">
                    <h4 className="text-zinc-400 text-xs font-bold uppercase tracking-wider">Behavior</h4>
                    <div className="space-y-2">
                        <label className="text-sm text-zinc-300">Animation Style</label>
                        <select
                            value={settings.animationStyle}
                            onChange={(e) => updateSetting('animationStyle', e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-zinc-200 outline-none focus:ring-2 focus:ring-purple-500"
                        >
                            <option value="slide">Slide In</option>
                            <option value="fade">Fade In</option>
                            <option value="zoom">Zoom Pop</option>
                            <option value="bounce">Bounce</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm text-zinc-300 flex justify-between">
                            Display Duration <span>{settings.displayDuration}s</span>
                        </label>
                        <input
                            type="range"
                            min="1"
                            max="30"
                            value={settings.displayDuration}
                            onChange={(e) => updateSetting('displayDuration', parseInt(e.target.value))}
                            className="w-full accent-purple-500"
                        />
                        <p className="text-[11px] text-zinc-500 italic">How long should the message stay on screen before auto-hiding.</p>
                    </div>
                </section>
            </div>
        </div>
    );
}
