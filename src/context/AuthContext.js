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
                console.log('Auth State: Active', currentUser.uid);

                // 1. Sync User Metadata (always update on session start)
                const userRef = doc(db, 'users', currentUser.uid);
                await setDoc(userRef, {
                    photoURL: currentUser.photoURL,
                    twitchId: currentUser.providerData[0].uid,
                    lastLogin: new Date().toISOString()
                }, { merge: true });

                // 2. Resolve Twitch Token (private)
                const tokenDoc = await getDoc(doc(db, 'users', currentUser.uid, 'private', 'twitch'));
                if (tokenDoc.exists()) {
                    setTwitchToken(tokenDoc.data().accessToken);
                }

                const userDoc = await getDoc(userRef);
                console.log('User Profile:', userDoc.data()?.twitchUsername || 'NO_USERNAME');
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
            const username = additionalInfo?.profile?.login || additionalInfo?.profile?.preferred_username;

            if (username) {
                console.log('Capturing Twitch Username:', username);
                await setDoc(doc(db, 'users', result.user.uid), {
                    twitchUsername: username.toLowerCase(),
                    displayName: result.user.displayName,
                    photoURL: result.user.photoURL
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
