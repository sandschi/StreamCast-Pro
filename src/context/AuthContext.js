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
                // Master-admin detection uses twitchUsername (Firestore), not
                // currentUser.displayName — Firebase's generic OIDC integration
                // never actually populates displayName for the Twitch provider, so
                // that check silently evaluated false on every returning session
                // (confirmed via the Admin Security Check log: displayName is
                // always null here, even for the real master admin). twitchUsername
                // is populated once from the raw OAuth response at login
                // (loginWithTwitch, below) and locked from further client writes in
                // firestore.rules, so it's safe to trust here.
                let status = existingData?.status;
                const isSandschi = existingData?.twitchUsername?.toLowerCase() === 'sandschi';

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
                // cleanUsername comes straight from the raw Twitch OAuth response
                // (profile.login), not currentUser.displayName — Firebase's OIDC
                // integration never populates displayName for this provider, so
                // checking it here would always be false.
                const isSandschi = cleanUsername === 'sandschi';
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
