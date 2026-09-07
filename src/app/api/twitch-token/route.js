import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { encryptToken, decryptToken } from '@/lib/tokenCrypto';

// Twitch OAuth token, encrypted at rest (see src/lib/tokenCrypto.js).
// firestore.rules denies the client SDK direct access to
// users/{uid}/private/twitch - this route (Admin SDK, which bypasses those
// rules) is the only read/write path, and it only ever acts on the caller's
// own uid, taken from their verified ID token, never a client-supplied one.
async function verifyCaller(request) {
    const authHeader = request.headers.get('authorization') || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!idToken) return null;
    try {
        const adminAuth = await getAdminAuth();
        const decoded = await adminAuth.verifyIdToken(idToken);
        return decoded.uid;
    } catch (e) {
        return null;
    }
}

export async function POST(request) {
    try {
        const uid = await verifyCaller(request);
        if (!uid) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const { accessToken } = await request.json();
        if (!accessToken || typeof accessToken !== 'string') {
            return NextResponse.json({ success: false, error: 'Missing accessToken' }, { status: 400 });
        }

        const db = await getAdminDb();
        await db.doc(`users/${uid}/private/twitch`).set({
            accessTokenEncrypted: encryptToken(accessToken),
            // Clears any pre-encryption plaintext copy from before this route
            // existed - a no-op if the field was never there.
            accessToken: admin.firestore.FieldValue.delete(),
            updatedAt: new Date().toISOString(),
        }, { merge: true });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error storing Twitch token:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}

export async function GET(request) {
    try {
        const uid = await verifyCaller(request);
        if (!uid) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

        const db = await getAdminDb();
        const ref = db.doc(`users/${uid}/private/twitch`);
        const snap = await ref.get();
        if (!snap.exists) return NextResponse.json({ success: true, accessToken: null });

        const data = snap.data();
        if (data.accessTokenEncrypted) {
            return NextResponse.json({ success: true, accessToken: decryptToken(data.accessTokenEncrypted) });
        }

        // Legacy doc written before this route existed (plaintext
        // accessToken field). Serve it once, and transparently migrate it to
        // the encrypted field so it's never read back in plaintext again.
        if (data.accessToken) {
            await ref.set({
                accessTokenEncrypted: encryptToken(data.accessToken),
                accessToken: admin.firestore.FieldValue.delete(),
            }, { merge: true });
            return NextResponse.json({ success: true, accessToken: data.accessToken });
        }

        return NextResponse.json({ success: true, accessToken: null });
    } catch (error) {
        console.error('Error reading Twitch token:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
