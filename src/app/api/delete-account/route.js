import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { decryptToken } from '@/lib/tokenCrypto';

// Same hardcoded UID firestore.rules' isMasterAdmin() checks - self-deleting
// this account would strand the app (it's the only account the master-admin
// bypass and /api/set-admin-claim ever apply to), so it's blocked here rather
// than relying on the caller's own good judgment in the UI.
const MASTER_ADMIN_UID = 'WPifULbh4NePmKpojiAnKwv0rWY2';

// Best-effort: tells Twitch itself to forget this app's authorization, so a
// deleted account doesn't silently skip Twitch's consent screen on a future
// login just because Twitch still considers the grant active. Must not block
// deletion if it fails (expired/already-revoked token, Twitch API hiccup) -
// losing the whole deletion over a revoke call that doesn't matter much
// would be worse than leaving one grant live on Twitch's side.
async function revokeTwitchToken(accessToken) {
    const clientId = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
    if (!clientId || !accessToken) return;
    try {
        await fetch('https://id.twitch.tv/oauth2/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: clientId, token: accessToken }),
        });
    } catch (e) {
        console.error('Error revoking Twitch token (non-fatal):', e);
    }
}

// Deletes every batch.delete() queued across `refs` in chunks of 500 -
// Firestore's per-batch write cap. Only the permissions/online cleanup below
// can plausibly approach that on a large enough deployment; recursiveDelete
// elsewhere in this route handles its own chunking internally.
async function batchDeleteAll(db, refs) {
    for (let i = 0; i < refs.length; i += 500) {
        const batch = db.batch();
        for (const ref of refs.slice(i, i + 500)) batch.delete(ref);
        await batch.commit();
    }
}

// Deletes a user's own account: everything under users/{uid} (settings,
// history, message_queue, karaoke_requests, private/*, etc. - recursiveDelete
// walks all of it, so nothing needs listing by hand here), their
// usernames/{twitchUsername} lookup doc, and finally the Firebase Auth
// account itself. Irreversible and immediate, matching the retention policy
// in the Privacy Policy (no grace period, no backups to fall back on).
//
// Also sweeps every OTHER broadcaster's permissions/{uid} and online/{uid}
// docs for this uid via a collectionGroup scan - these aren't just a role
// string, they carry a copy of displayName/photoURL/twitchUsername
// (see useUsersData.js's setRole and dashboard/page.js's presence heartbeat),
// so leaving them behind would mean personal data surviving "deletion" on
// every channel this person ever visited or moderated.
export async function POST(request) {
    try {
        const authHeader = request.headers.get('authorization') || '';
        const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!idToken) {
            return NextResponse.json({ success: false, error: 'Missing ID token' }, { status: 401 });
        }

        const adminAuth = await getAdminAuth();
        const decoded = await adminAuth.verifyIdToken(idToken);
        const uid = decoded.uid;

        if (uid === MASTER_ADMIN_UID) {
            return NextResponse.json({ success: false, error: 'The master admin account cannot be self-deleted.' }, { status: 403 });
        }

        const db = await getAdminDb();
        const userRef = db.doc(`users/${uid}`);
        const userSnap = await userRef.get();
        const twitchUsername = userSnap.exists ? userSnap.data().twitchUsername : null;

        // Revoke on Twitch's side before the token itself is wiped below.
        // Wrapped separately from the rest of deletion: a decrypt failure
        // here (bad key config, corrupted ciphertext) must never block the
        // account deletion itself - that would turn a broken revoke into an
        // undeletable account, which is a worse outcome than just skipping it.
        try {
            const tokenSnap = await db.doc(`users/${uid}/private/twitch`).get();
            if (tokenSnap.exists) {
                const tokenData = tokenSnap.data();
                const plaintext = tokenData.accessTokenEncrypted
                    ? decryptToken(tokenData.accessTokenEncrypted)
                    : tokenData.accessToken || null;
                if (plaintext) await revokeTwitchToken(plaintext);
            }
        } catch (e) {
            console.error('Error preparing Twitch token revocation (non-fatal):', e);
        }

        // Cross-channel cleanup: find every permissions/{uid} and online/{uid}
        // doc regardless of which broadcaster's channel it lives under.
        // Filtered client-side by doc.id - Firestore collectionGroup queries
        // can't filter "any parent, this exact last segment" via a where()
        // clause, and these subcollections are small enough on a product this
        // size that scanning them in full is the simpler, correct choice.
        // Best-effort like the revoke above: a problem here is a data-hygiene
        // issue, not a reason to refuse someone's own deletion request.
        try {
            const [permsSnap, onlineSnap] = await Promise.all([
                db.collectionGroup('permissions').get(),
                db.collectionGroup('online').get(),
            ]);
            const staleRefs = [
                ...permsSnap.docs.filter(d => d.id === uid).map(d => d.ref),
                ...onlineSnap.docs.filter(d => d.id === uid).map(d => d.ref),
            ];
            if (staleRefs.length > 0) await batchDeleteAll(db, staleRefs);
        } catch (e) {
            console.error('Error cleaning up cross-channel references (non-fatal):', e);
        }

        await db.recursiveDelete(userRef);

        if (twitchUsername) {
            await db.doc(`usernames/${twitchUsername}`).delete().catch(() => {
                // Non-fatal: the mapping doc is a convenience lookup, not
                // something the rest of deletion depends on.
            });
        }

        await adminAuth.deleteUser(uid);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting account:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
