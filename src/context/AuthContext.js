'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    OAuthProvider,
    getAdditionalUserInfo
} from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth || !auth.onAuthStateChanged) {
            setLoading(false);
            return;
        }
        const unsubscribe = onAuthStateChanged(auth, async (u) => {
            if (u) {
                // Fetch or create user settings
                const userDoc = await getDoc(doc(db, 'users', u.uid));
                if (!userDoc.exists()) {
                    await setDoc(doc(db, 'users', u.uid), {
                        displayName: u.displayName,
                        photoURL: u.photoURL,
                        twitchId: u.providerData[0].uid,
                    }, { merge: true });

                    // Initialize default settings
                    await setDoc(doc(db, 'users', u.uid, 'settings', 'config'), {
                        textColor: '#ffffff',
                        strokeColor: '#000000',
                        fontSize: 24,
                        animationStyle: 'slide',
                        displayDuration: 5,
                    });
                }
                setUser(u);
            } else {
                setUser(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const loginWithTwitch = async () => {
        const provider = new OAuthProvider('oidc.twitch');
        // Note: Twitch OIDC requires configuration in Firebase Console
        provider.addScope('chat:read');
        provider.addScope('chat:edit');
        provider.addScope('channel:read:redemptions');

        try {
            const result = await signInWithPopup(auth, provider);
            const additionalInfo = getAdditionalUserInfo(result);
            // Twitch username is usually in preferred_username
            const username = additionalInfo?.profile?.preferred_username || result._tokenResponse?.screenName;

            if (username) {
                await setDoc(doc(db, 'users', result.user.uid), {
                    twitchUsername: username.toLowerCase(),
                }, { merge: true });
            }
        } catch (error) {
            console.error('Login error:', error);
        }
    };

    const logout = () => signOut(auth);

    return (
        <AuthContext.Provider value={{ user, loading, loginWithTwitch, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
