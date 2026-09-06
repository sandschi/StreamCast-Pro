'use client';
export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

// The human-readable karaoke.sandschi.xyz/{username} entry point (see #27) -
// resolves a Twitch username to a broadcaster's uid via the public
// usernames/{username} lookup, then hands off to the existing dashboard-invite
// mechanism (?host={uid}) so login, the gate screens, and everything else
// about reaching a specific broadcaster's dashboard stays exactly as it
// already works for a mod/singer/viewer link today - this route only adds a
// friendlier way to arrive at the same place.
export default function UsernameEntryPage() {
    const { username } = useParams();
    const router = useRouter();
    const [state, setState] = useState('loading'); // 'loading' | 'not-found'

    useEffect(() => {
        if (!username) return;
        let cancelled = false;
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'usernames', String(username).toLowerCase()));
                if (cancelled) return;
                if (snap.exists()) {
                    const uid = snap.data().uid;
                    // usernames/{username} is create-only and never cleaned up, so a
                    // mapping can outlive the account it points to. Confirm the
                    // account still exists before redirecting - but only when we
                    // actually can: users/{uid} requires request.auth != null (see
                    // firestore.rules), and this route is mainly hit by logged-out
                    // visitors, so a not-yet-signed-in visitor still gets redirected
                    // on the mapping's word alone, same as before.
                    try {
                        const userSnap = await getDoc(doc(db, 'users', uid));
                        if (!cancelled && !userSnap.exists()) { setState('not-found'); return; }
                    } catch { /* not signed in yet - can't verify, fall through */ }
                    if (!cancelled) router.replace(`/dashboard?host=${uid}&tab=karaoke`);
                } else {
                    setState('not-found');
                }
            } catch {
                if (!cancelled) setState('not-found');
            }
        })();
        return () => { cancelled = true; };
    }, [username, router]);

    return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#0a0a0a', color: '#e4e4e7', fontFamily: 'var(--font-sans, sans-serif)', textAlign: 'center', padding: 24 }}>
            {state === 'loading' ? (
                <div style={{ fontSize: 14, opacity: 0.7 }}>Loading…</div>
            ) : (
                <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>No channel found for &ldquo;{username}&rdquo;</div>
                    <div style={{ marginTop: 8, fontSize: 13, opacity: 0.6 }}>Double-check the link, or ask the broadcaster for the right one.</div>
                </div>
            )}
        </div>
    );
}
