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
import posthog from 'posthog-js';

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

                // Determine initial status. isSandschi (twitchUsername-based) only
                // ever drives the auto-approval decision below, not the client
                // isMasterAdmin flag (see the custom-claims block further down) -
                // twitchUsername is populated once from the raw OAuth response at
                // login (loginWithTwitch) and locked from further client writes in
                // firestore.rules, so it's stale-but-safe to trust for this one
                // purpose: a returning already-approved user's status is left alone
                // regardless (see the condition below), so a stale twitchUsername
                // here can only ever affect a not-yet-approved account.
                let status = existingData?.status;
                const isSandschi = existingData?.twitchUsername?.toLowerCase() === 'sandschi';

                if (!status || (isSandschi && status !== 'approved')) {
                    status = isSandschi ? 'approved' : 'waiting';
                }

                // Master-admin UI/rules detection: a Firebase custom claim, set
                // server-side by this same account after login, instead of the
                // twitchUsername field above — claims survive a Twitch handle
                // rename (twitchUsername freezes at whatever it was on first
                // write; see #19), and are never client-writable at all, unlike a
                // Firestore field that's merely rules-locked from update.
                // Safe/cheap to call every session: the route is a no-op for
                // every UID except the one hardcoded master-admin account.
                try {
                    const idToken = await currentUser.getIdToken();
                    await fetch('/api/set-admin-claim', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${idToken}` },
                    });
                    const tokenResult = await currentUser.getIdTokenResult(true); // force refresh to pick up a just-set claim
                    setIsMasterAdmin(tokenResult.claims.isMasterAdmin === true);
                } catch (e) {
                    console.error('Error resolving master-admin claim:', e);
                    setIsMasterAdmin(false);
                }
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
                // Ties every event this session sends to a real person instead of an
                // anonymous browser distinct_id - runs on every session restore, not
                // just an interactive login, since onAuthStateChanged fires for both.
                posthog.identify(currentUser.uid);
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
                // isMasterAdmin itself is no longer set here — onAuthStateChanged
                // (which signInWithPopup triggers right after this resolves) derives
                // the authoritative value from the custom claim instead.

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

    const logout = () => {
        // Otherwise the next person to sign in on this device/browser would
        // keep getting merged into the previous user's PostHog identity.
        posthog.reset();
        return signOut(auth);
    };

    return (
        <AuthContext.Provider value={{ user, userData, twitchToken, isMasterAdmin, loading, loginWithTwitch, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
