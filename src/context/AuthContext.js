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
    const [twitchToken, setTwitchToken] = useState(null); // Used for live verification
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth || !auth.onAuthStateChanged) {
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                console.log('Auth State: Logged In', currentUser.uid);

                // 1. Ensure user entry exists
                const userRef = doc(db, 'users', currentUser.uid);
                const userDoc = await getDoc(userRef);

                if (!userDoc.exists()) {
                    await setDoc(userRef, {
                        displayName: currentUser.displayName,
                        photoURL: currentUser.photoURL,
                        twitchId: currentUser.providerData[0].uid,
                        createdAt: new Date().toISOString()
                    }, { merge: true });

                    // Initialize default settings
                    await setDoc(doc(db, 'users', currentUser.uid, 'settings', 'config'), {
                        textColor: '#ffffff',
                        strokeColor: '#000000',
                        fontSize: 24,
                        animationStyle: 'slide',
                        displayDuration: 5,
                    });
                }

                // 2. Resolve Twitch Token (private)
                const tokenDoc = await getDoc(doc(db, 'users', currentUser.uid, 'private', 'twitch'));
                if (tokenDoc.exists()) {
                    const token = tokenDoc.data().accessToken;
                    console.log('Twitch Token resolved from Cloud Store');
                    setTwitchToken(token);
                } else {
                    console.warn('No Twitch Token found in Cloud Store. Live verification will be limited.');
                }

                setUser(currentUser);
            } else {
                setUser(null);
                setTwitchToken(null);
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

            // Capture & Persist Token to Cloud
            const credential = OAuthProvider.credentialFromResult(result);
            if (credential?.accessToken) {
                setTwitchToken(credential.accessToken);
                await setDoc(doc(db, 'users', result.user.uid, 'private', 'twitch'), {
                    accessToken: credential.accessToken,
                    updatedAt: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Login error:', error);
        }
    };

    const logout = () => signOut(auth);

    return (
        <AuthContext.Provider value={{ user, twitchToken, loading, loginWithTwitch, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
