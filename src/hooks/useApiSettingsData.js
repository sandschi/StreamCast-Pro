'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';

export const REMOTE_ACTIONS = [
    { group: 'KaraFun Queue', tone: '#3b82f6', items: [
        { action: 'toggle-karafun-queue', label: 'Toggle Visibility', description: 'Swaps the current on/off state of the queue.' },
        { action: 'karafun-queue-on', label: 'Force Turn On', description: 'Explicitly shows the Queue overlay.' },
        { action: 'karafun-queue-off', label: 'Force Turn Off', description: 'Explicitly hides the Queue overlay.' },
    ]},
    { group: 'Now Playing Popup', tone: 'var(--primary-500)', items: [
        { action: 'toggle-now-playing', label: 'Toggle Visibility', description: 'Swaps the current on/off state of the playing popup.' },
        { action: 'now-playing-on', label: 'Force Turn On', description: 'Explicitly enables the Now Playing popup feature.' },
        { action: 'now-playing-off', label: 'Force Turn Off', description: 'Explicitly disables the Now Playing popup feature.' },
        { action: 'show-now-playing', label: 'Show Now Playing', description: 'Immediately displays the Now Playing popup for 10 seconds.' },
        { action: 'hide-now-playing', label: 'Dismiss Now Playing', description: 'Immediately hides the manually triggered Now Playing popup.' },
    ]},
    { group: 'Chat Messages', tone: '#f43f5e', items: [
        { action: 'hide-message', label: 'Hide Active Message', description: 'Removes any highlighted chat message currently on the overlay.' },
    ]},
];

// Extracted verbatim from the original inline logic in components/dashboard/ApiSettings.js.
export function useApiSettingsData({ targetUid, user, privateConfig, setPrivateConfig, isMasterAdmin, userRole }) {
    const [generatingToken, setGeneratingToken] = useState(false);
    const [copyState, setCopyState] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (copyState) {
            const timer = setTimeout(() => setCopyState(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [copyState]);

    const handleGenerateToken = async () => {
        if (!user || (!isMasterAdmin && userRole !== 'broadcaster')) return;

        const effectiveUid = isMasterAdmin ? (targetUid || user.uid) : user.uid;

        setGeneratingToken(true);
        setError(null);
        try {
            const token = crypto.randomUUID();
            await setDoc(doc(db, 'users', effectiveUid, 'private', 'config'), {
                apiToken: token
            }, { merge: true });
            if (setPrivateConfig) {
                setPrivateConfig(prev => ({ ...prev, apiToken: token }));
            }
        } catch (err) {
            console.error('Error generating token:', err);
            setError(err.message || 'Failed to generate API token. Please try again.');
        } finally {
            setGeneratingToken(false);
        }
    };

    const copyApiCommand = async (action) => {
        if (!user || !privateConfig?.apiToken) return;
        const baseUrl = window.location.origin;
        const uid = isMasterAdmin ? (targetUid || user.uid) : user.uid;

        const url = `${baseUrl}/api/overlay/${uid}?action=${encodeURIComponent(action)}&token=${encodeURIComponent(privateConfig.apiToken)}`;

        try {
            await navigator.clipboard.writeText(url);
            setCopyState(`api-${action}`);
        } catch (err) {
            console.error('Failed to copy API link!', err);
        }
    };

    const copyTokenOnly = async () => {
        if (!privateConfig?.apiToken) return;
        try {
            await navigator.clipboard.writeText(privateConfig.apiToken);
            setCopyState('token');
        } catch (err) {
            console.error('Failed to copy token!', err);
        }
    };

    return { generatingToken, copyState, error, handleGenerateToken, copyApiCommand, copyTokenOnly };
}
