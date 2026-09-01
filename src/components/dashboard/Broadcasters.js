import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { db } from '@/lib/firebase';
import { collection, onSnapshot, doc, updateDoc, query, where } from 'firebase/firestore';
import { Users, Clock, ShieldCheck, Send } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import BroadcasterRow from '@/components/dashboard/BroadcasterRow';

export default function Broadcasters() {
    const [broadcasters, setBroadcasters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [testingWebhook, setTestingWebhook] = useState(false);

    useEffect(() => {
        // Query all users who have a twitchUsername (indicating they are broadcasters)
        const usersRef = collection(db, 'users');
        const unsubscribe = onSnapshot(usersRef, (snapshot) => {
            const list = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(u => u.twitchUsername); // Only show those who signed in as broadcasters
            setBroadcasters(list);
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

    if (loading) return (
        <div className="flex items-center justify-center p-20 text-zinc-500">
            <Clock className="animate-spin mr-2" /> Loading users...
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary-600/20 rounded-lg text-primary-400">
                        <ShieldCheck size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold">Broadcaster Management</h2>
                        <p className="text-sm text-zinc-500 text-[10px] uppercase tracking-widest font-bold">Master Admin View</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={testWebhook}
                        disabled={testingWebhook}
                        className="btn-awesome !bg-zinc-800 !text-white !shadow-none hover:!bg-zinc-700 active:scale-95"
                    >
                        <Send size={16} className={testingWebhook ? 'animate-pulse' : ''} />
                        {testingWebhook ? 'Sending...' : 'Test Webhook'}
                    </button>
                    <div className="text-right">
                        <span className="text-2xl font-black text-white">{broadcasters.length}</span>
                        <p className="text-[10px] text-zinc-500 uppercase font-black">Registered</p>
                    </div>
                </div>
            </div>

            <div className="grid gap-4">
                {broadcasters.map((u) => (
                    <BroadcasterRow
                        key={u.id}
                        displayName={u.displayName}
                        twitchUsername={u.twitchUsername}
                        photoURL={u.photoURL}
                        status={u.status}
                        onStatusChange={(status) => setStatus(u.id, status)}
                    />
                ))}

                {broadcasters.length === 0 && (
                    <EmptyState size="lg" icon={<Users size={48} />} title="No broadcasters found in the system." />
                )}
            </div>
        </div>
    );
}
