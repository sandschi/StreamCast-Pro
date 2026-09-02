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
    const [userData, setUserData] = useState(null);
    const [twitchToken, setTwitchToken] = useState(null);
    const [isMasterAdmin, setIsMasterAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!auth || !auth.onAuthStateChanged) {
            setTimeout(() => setLoading(false), 0);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                console.log('Auth State: Active', currentUser.uid);

                // 1. Sync User Metadata (always update on session start)
                const userRef = doc(db, 'users', currentUser.uid);
                const userSnapshot = await getDoc(userRef);
                const existingData = userSnapshot.data();

                // Determine initial status
                // Master-admin detection uses ONLY displayName, which comes straight
                // from Firebase Auth's Twitch OIDC provider and is never client-writable.
                // twitchUsername lives in Firestore and, before this fix, was editable
                // from Settings — checking it here meant anyone could self-grant the
                // client-side master-admin UI by typing "sandschi" into that field.
                let status = existingData?.status;
                const isSandschi = currentUser.displayName?.toLowerCase() === 'sandschi';

                if (!status || (isSandschi && status !== 'approved')) {
                    status = isSandschi ? 'approved' : 'waiting';
                }

                setIsMasterAdmin(isSandschi); // Set master admin status
                const updateData = {
                    twitchId: currentUser.providerData[0].uid,
                    lastLogin: new Date().toISOString(),
                    status: status // Persist approval status
                };
                if (currentUser.photoURL) {
                    updateData.photoURL = currentUser.photoURL;
                }

                await setDoc(userRef, updateData, { merge: true });

                // 2. Resolve Twitch Token (private)
                const tokenDoc = await getDoc(doc(db, 'users', currentUser.uid, 'private', 'twitch'));
                if (tokenDoc.exists()) {
                    setTwitchToken(tokenDoc.data().accessToken);
                }

                const userDoc = await getDoc(userRef);
                console.log('User Profile:', userDoc.data()?.twitchUsername || 'NO_USERNAME');
                setUserData(userDoc.data());
                setUser(currentUser);
            } else {
                setIsMasterAdmin(false);
                setUser(null);
                setUserData(null);
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
        provider.addScope('moderator:read:chatters');

        try {
            const result = await signInWithPopup(auth, provider);
            const additionalInfo = getAdditionalUserInfo(result);
            const username = additionalInfo?.profile?.login || additionalInfo?.profile?.preferred_username;
            const isNewUser = additionalInfo?.isNewUser;
            const extractedPhotoURL = result.user.photoURL || additionalInfo?.profile?.picture || additionalInfo?.profile?.profile_image_url || null;

            if (username) {
                const cleanUsername = username.toLowerCase();
                console.log('Syncing Identity:', cleanUsername);
                const isSandschi = result.user.displayName?.toLowerCase() === 'sandschi' || cleanUsername === 'sandschi';
                setIsMasterAdmin(isSandschi); // Set master admin status on login

                const userData = {
                    twitchUsername: cleanUsername,
                    displayName: result.user.displayName,
                    photoURL: extractedPhotoURL,
                };
                // Only ever set status for a brand-new user (isNewUser, below) or the
                // real master admin — a returning broadcaster's status was previously
                // recomputed here on every login with no regard for an existing
                // approval, silently resetting already-approved broadcasters back to
                // "waiting" (racing with the correct, preserving logic in
                // onAuthStateChanged above, so the outcome was non-deterministic).
                if (isNewUser || isSandschi) {
                    userData.status = isSandschi ? 'approved' : 'waiting';
                }

                await setDoc(doc(db, 'users', result.user.uid), userData, { merge: true });

                // Send Discord notification for new signups
                if (isNewUser && !isSandschi) {
                    try {
                        await fetch('/api/notify-signup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: result.user.uid,
                                userData: {
                                    ...userData,
                                    lastLogin: new Date().toISOString()
                                }
                            })
                        });
                    } catch (notifyError) {
                        console.error('Failed to send Discord notification:', notifyError);
                        // Don't block login if notification fails
                    }
                }
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
        <AuthContext.Provider value={{ user, userData, twitchToken, isMasterAdmin, setIsMasterAdmin, loading, loginWithTwitch, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
