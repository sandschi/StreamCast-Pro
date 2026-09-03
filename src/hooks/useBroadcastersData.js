'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';

// Extracted verbatim from the original inline logic in components/dashboard/Broadcasters.js.
export function useBroadcastersData() {
    const [broadcasters, setBroadcasters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [testingWebhook, setTestingWebhook] = useState(false);

    useEffect(() => {
        const usersRef = collection(db, 'users');
        const unsubscribe = onSnapshot(usersRef, (snapshot) => {
            const list = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(u => u.twitchUsername);
            setBroadcasters(list);
            setError(null);
            setLoading(false);
        }, (err) => {
            console.error('Failed to load broadcasters:', err);
            setError(err.message || 'Failed to load broadcasters.');
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const setStatus = async (userId, status) => {
        try {
            await updateDoc(doc(db, 'users', userId), { status });
        } catch (e) {
            console.error('Failed to update status:', e);
        }
    };

    const testWebhook = async () => {
        setTestingWebhook(true);
        try {
            const response = await fetch('/api/notify-signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: 'test-webhook-' + Date.now(),
                    userData: {
                        twitchUsername: 'test_user',
                        displayName: 'Test User',
                        photoURL: 'https://static-cdn.jtvnw.net/user-default-pictures-uv/cdd517fe-def4-11e9-948e-784f43822e80-profile_image-300x300.png',
                        status: 'waiting',
                        lastLogin: new Date().toISOString()
                    }
                })
            });

            if (response.ok) {
                alert('✅ Test notification sent to Discord!');
            } else {
                alert('❌ Failed to send test notification. Check console for details.');
            }
        } catch (error) {
            console.error('Test webhook error:', error);
            alert('❌ Error sending test notification: ' + error.message);
        } finally {
            setTestingWebhook(false);
        }
    };

    return { broadcasters, loading, error, testingWebhook, setStatus, testWebhook };
}
