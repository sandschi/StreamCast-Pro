'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import posthog from 'posthog-js';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [twitchToken, setTwitchToken] = useState(null);
    const [isMasterAdmin, setIsMasterAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!supabase) {
            setTimeout(() => setLoading(false), 0);
            return;
        }

        // Supabase-js deadlocks if any supabase.auth.* method (getSession,
        // refreshSession, etc.) is awaited synchronously inside this callback -
        // it internally serializes auth state-change processing, and a nested
        // call blocks on a lock the SDK itself is still holding. Deferring the
        // whole body with setTimeout(0) is the documented workaround (this
        // handler calls getSession()/refreshSession() below).
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          setTimeout(async () => {
            const currentUser = session?.user ?? null;
            if (currentUser) {
                console.log('Auth State: Active', currentUser.id);

                // 1. Resolve whether this is a brand-new signup. Firebase's
                // signInWithPopup gave this for free via getAdditionalUserInfo;
                // the redirect flow (confirmed plan decision) has no equivalent,
                // so it's re-derived from whether a users row already exists -
                // see migration plan §3.
                const { data: existingRow } = await supabase
                    .from('users')
                    .select('status, twitch_username')
                    .eq('id', currentUser.id)
                    .maybeSingle();
                const isNewUser = !existingRow;

                // Twitch identity fields live under different keys than
                // Firebase's OIDC integration used (profile.login /
                // preferred_username) - Supabase's built-in Twitch provider
                // maps them to name/slug/nickname instead (verified directly
                // against a real login's identity_data).
                const twitchUsername = (currentUser.user_metadata?.name
                    || currentUser.user_metadata?.slug
                    || currentUser.user_metadata?.nickname
                    || '').toLowerCase();
                const isSandschi = (existingRow?.twitch_username || twitchUsername) === 'sandschi';

                // Same status-preservation logic as before: only ever set
                // status for a brand-new user or the real master admin - a
                // returning already-approved broadcaster's status is left
                // alone regardless.
                let status = existingRow?.status;
                if (!status || (isSandschi && status !== 'approved')) {
                    status = isSandschi ? 'approved' : 'waiting';
                }

                // 2. Upsert profile. The UNIQUE constraint on twitch_username
                // (schema) replaces Firestore's separate usernames/{username}
                // lookup collection entirely - no create-then-check dance
                // needed. twitch_username is only ever included for a brand
                // new row; RLS's enforce_users_update trigger locks it (and
                // status) from a non-admin's later updates, matching
                // firestore.rules' old lock.
                const upsertData = {
                    id: currentUser.id,
                    twitch_id: currentUser.user_metadata?.provider_id || currentUser.user_metadata?.sub,
                    display_name: currentUser.user_metadata?.full_name || currentUser.user_metadata?.name,
                    last_login: new Date().toISOString(),
                    status,
                };
                const photoURL = currentUser.user_metadata?.avatar_url || currentUser.user_metadata?.picture;
                if (photoURL) upsertData.photo_url = photoURL;
                if (isNewUser) upsertData.twitch_username = twitchUsername;

                try {
                    await supabase.from('users').upsert(upsertData);
                } catch (e) {
                    console.error('Error syncing user profile:', e);
                }

                // 3. Master-admin claim resolution: same "safe every login,
                // no-op for everyone else" shape as before - see
                // /api/set-admin-claim.
                try {
                    const { data: { session: currentSession } } = await supabase.auth.getSession();
                    await fetch('/api/set-admin-claim', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${currentSession.access_token}` },
                    });
                    // Force-refresh to pick up a just-set app_metadata claim -
                    // same reasoning as Firebase's getIdTokenResult(true).
                    const { data: refreshed } = await supabase.auth.refreshSession();
                    setIsMasterAdmin(refreshed?.session?.user?.app_metadata?.is_master_admin === true);
                } catch (e) {
                    console.error('Error resolving master-admin claim:', e);
                    setIsMasterAdmin(false);
                }

                // 4. Resolve Twitch token (private, encrypted at rest - see
                // /api/twitch-token). RLS denies the client any access to
                // private_twitch_tokens at all, so this route (service-role
                // backed) is the only way to get the decrypted value back.
                try {
                    const { data: { session: tokenSession } } = await supabase.auth.getSession();
                    const tokenRes = await fetch('/api/twitch-token', {
                        headers: { Authorization: `Bearer ${tokenSession.access_token}` },
                    });
                    const tokenJson = await tokenRes.json();
                    if (tokenJson.accessToken) setTwitchToken(tokenJson.accessToken);
                } catch (e) {
                    console.error('Error resolving Twitch token:', e);
                }

                // 5. Store the Twitch OAuth provider token. Only present on
                // the SIGNED_IN event right after a fresh redirect back from
                // Twitch, not on later session restores/refreshes - mirrors
                // Firebase's credential-only-on-signIn behavior.
                if (event === 'SIGNED_IN' && session?.provider_token) {
                    setTwitchToken(session.provider_token);
                    try {
                        await fetch('/api/twitch-token', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
                            body: JSON.stringify({ accessToken: session.provider_token }),
                        });
                    } catch (e) {
                        console.error('Error storing Twitch token:', e);
                    }
                }

                // Discord notification for new signups
                if (isNewUser && !isSandschi) {
                    try {
                        await fetch('/api/notify-signup', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                userId: currentUser.id,
                                userData: {
                                    twitchUsername,
                                    displayName: upsertData.display_name,
                                    photoURL: upsertData.photo_url,
                                    lastLogin: upsertData.last_login,
                                    status,
                                },
                            }),
                        });
                    } catch (notifyError) {
                        console.error('Failed to send Discord notification:', notifyError);
                        // Don't block login if notification fails
                    }
                }

                const { data: freshRow } = await supabase.from('users').select('*').eq('id', currentUser.id).single();
                console.log('User Profile:', freshRow?.twitch_username || 'NO_USERNAME');
                setUserData(freshRow);
                setUser(currentUser);
                // Ties every event this session sends to a real person instead of an
                // anonymous browser distinct_id - runs on every session restore, not
                // just an interactive login, since onAuthStateChange fires for both.
                posthog.identify(currentUser.id);
            } else {
                setIsMasterAdmin(false);
                setUser(null);
                setUserData(null);
                setTwitchToken(null);
            }
            setLoading(false);
          }, 0);
        });

        return () => subscription.unsubscribe();
    }, []);

    const loginWithTwitch = async () => {
        // Redirect flow (confirmed plan decision, not a popup like Firebase's
        // signInWithPopup) - this navigates away immediately. All post-login
        // logic lives in onAuthStateChange above, which fires once the user
        // is redirected back with a session.
        try {
            // GoTrue's built-in Twitch provider has no server-side scope
            // config at all (checked its actual Go source - no Scopes field
            // exists on the provider config struct), unlike Firebase's
            // OAuthProvider.addScope() which configured this per-call. The
            // true equivalent here is signInWithOAuth's own per-call
            // `scopes` option, which Supabase does support and forwards
            // straight through to the provider's OAuth request.
            await supabase.auth.signInWithOAuth({
                provider: 'twitch',
                options: {
                    redirectTo: window.location.origin,
                    scopes: 'chat:read chat:edit channel:read:redemptions moderator:read:chatters',
                },
            });
        } catch (error) {
            console.error('Login error:', error);
        }
    };

    const logout = () => {
        // Otherwise the next person to sign in on this device/browser would
        // keep getting merged into the previous user's PostHog identity.
        posthog.reset();
        return supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{ user, userData, twitchToken, isMasterAdmin, loading, loginWithTwitch, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
