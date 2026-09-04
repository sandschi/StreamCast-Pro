'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, runTransaction } from 'firebase/firestore';
import posthog from 'posthog-js';

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

    // Plain updateDoc had no protection against two admin sessions (two tabs,
    // two devices) racing on the same broadcaster's status - whichever write
    // landed last silently won. expectedCurrentStatus is whatever this
    // session's own snapshot last saw for this broadcaster; the transaction
    // re-reads the doc and aborts instead of overwriting if that's gone stale,
    // rather than trusting a value that might be seconds or minutes old.
    const setStatus = async (userId, status, expectedCurrentStatus) => {
        const userRef = doc(db, 'users', userId);
        try {
            await runTransaction(db, async (transaction) => {
                const snap = await transaction.get(userRef);
                // Match BroadcastersPane's own display fallback (b.status || 'waiting')
                // so an absent status field compares equal to the 'waiting' the UI
                // showed, instead of a false stale-rejection on every first decision.
                const currentStatus = snap.data()?.status || 'waiting';
                if (expectedCurrentStatus !== undefined && currentStatus !== expectedCurrentStatus) {
                    throw new Error("This broadcaster's status changed since your list last updated — refresh and try again.");
                }
                transaction.update(userRef, { status });
            });
            if (status === 'approved') posthog.capture('broadcaster_approved', { userId });
            else if (status === 'denied') posthog.capture('broadcaster_denied', { userId });
        } catch (e) {
            console.error('Failed to update status:', e);
            alert(e.message || 'Failed to update status.');
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
