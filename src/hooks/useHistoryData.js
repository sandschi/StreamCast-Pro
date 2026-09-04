'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, limit, onSnapshot, doc, setDoc, deleteDoc, addDoc, serverTimestamp, getDocs, writeBatch } from 'firebase/firestore';

// Extracted verbatim from the original inline logic in components/dashboard/History.js.
export function useHistoryData({ targetUid, userRole }) {
    const { user } = useAuth();
    const effectiveUid = targetUid || user?.uid;
    const [history, setHistory] = useState([]);
    const [activeMessage, setActiveMessage] = useState(null);

    useEffect(() => {
        if (!effectiveUid) return;

        const historyRef = collection(db, 'users', effectiveUid, 'history');
        const q = query(historyRef, orderBy('timestamp', 'desc'), limit(50));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setHistory(messages);
        });

        return () => unsubscribe();
    }, [effectiveUid]);

    useEffect(() => {
        if (!effectiveUid) return;
        const msgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
        const unsub = onSnapshot(msgRef, (doc) => {
            setActiveMessage(doc.exists() ? doc.data() : null);
        });
        return () => unsub();
    }, [effectiveUid]);

    const hideOverlay = async () => {
        if (!effectiveUid) return;
        try {
            await deleteDoc(doc(db, 'users', effectiveUid, 'active_message', 'current'));
        } catch (e) { console.error("Error hiding:", e); }
    };

    const resendToScreen = async (msg, permanent = false) => {
        if (!user || userRole === 'denied') return;

        const isViewer = userRole === 'viewer';
        const payload = {
            ...msg,
            timestamp: serverTimestamp(),
            suggestedBy: user.uid,
            suggestedByName: user.displayName,
            fromHistory: true
        };
        delete payload.id;

        if (permanent) {
            payload.duration = -1;
        } else {
            if (payload.duration) delete payload.duration;
        }

        try {
            if (isViewer) {
                const suggestionsRef = collection(db, 'users', effectiveUid, 'suggestions');
                if (payload.duration) delete payload.duration;
                await addDoc(suggestionsRef, payload);
                console.log('History Suggestion Sent ✅');
            } else {
                const activeMsgRef = doc(db, 'users', effectiveUid, 'active_message', 'current');
                await setDoc(activeMsgRef, payload);
                console.log('History Sent to Screen ✅');
            }
        } catch (e) { console.error(e); }
    };

    const clearHistory = async () => {
        if (!effectiveUid || (userRole !== 'broadcaster' && userRole !== 'mod')) return;
        try {
            const historyRef = collection(db, 'users', effectiveUid, 'history');
            const snapshot = await getDocs(historyRef);
            const batch = writeBatch(db);
            snapshot.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
        } catch (e) { console.error("Error clearing history:", e); }
    };

    return { effectiveUid, history, activeMessage, hideOverlay, resendToScreen, clearHistory };
}
