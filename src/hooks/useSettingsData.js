'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore';

export const SOUNDS = {
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

// Appearance (dashboard chrome) fields live on the same settings/config doc but,
// unlike the overlay fields below, write immediately — they're a live dashboard
// preference, not something staged behind the overlay's Save button.
const APPEARANCE_DEFAULTS = {
    dashboardTreatment: 'carbon',
    dashboardNav: 'tabs',
    dashboardDensity: 'compact',
    dashboardMenubar: true,
    dashboardStatusbar: true,
};

// Extracted verbatim from the original inline logic in components/dashboard/Settings.js,
// plus the new appearance fields the dashboard-app-shell redesign needs persisted.
export function useSettingsData({ targetUid, isModeratorMode }) {
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
        posX: 5,
        posY: 90,
        showAvatar: true,
        bubbleStyle: 'classic',
        soundEnabled: false,
        soundType: 'pop',
        soundVolume: 0.5,
        karafunEnabled: false,
        karafunPartyId: '',
        ...APPEARANCE_DEFAULTS,
    });

    const [twitchUsername, setTwitchUsername] = useState('');
    const [saving, setSaving] = useState(false);
    const [activeMessage, setActiveMessage] = useState(null);

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

    useEffect(() => {
        if (!effectiveUid) return;
        const msgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
        const unsub = onSnapshot(msgRef, (doc) => {
            setActiveMessage(doc.exists() ? doc.data() : null);
        });
        return () => unsub();
    }, [effectiveUid]);

    const updateSetting = (key, value) => setSettings(prev => ({ ...prev, [key]: value }));

    const updateAppearanceSetting = async (key, value) => {
        updateSetting(key, value);
        if (!effectiveUid) return;
        try {
            await setDoc(doc(db, 'users', effectiveUid, 'settings', 'config'), { [key]: value }, { merge: true });
        } catch (e) {
            console.error(`Error saving ${key}:`, e);
        }
    };

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            // twitchUsername is not user-editable — it is set from the real,
            // OAuth-verified Twitch login (AuthContext.js) and only ever read
            // here, never written back.
            await setDoc(doc(db, 'users', effectiveUid, 'settings', 'config'), settings, { merge: true });
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
                settings: settings
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
            await deleteDoc(doc(db, 'users', effectiveUid, 'active_message', 'current'));
        } catch (e) {
            console.error("Error hiding overlay:", e);
        }
    };

    return {
        effectiveUid, settings, updateSetting, updateAppearanceSetting,
        twitchUsername, saving, activeMessage,
        handleSave, sendTestOverlay, hideOverlay,
    };
}
