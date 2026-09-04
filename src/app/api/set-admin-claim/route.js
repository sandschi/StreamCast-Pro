import { NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

// Same hardcoded UID firestore.rules' isMasterAdmin() checks - see the rules
// file for why this stays hardcoded rather than moving to any client-supplied
// or Firestore-field value.
const MASTER_ADMIN_UID = 'WPifULbh4NePmKpojiAnKwv0rWY2';

// Safe to call on every login for every user: the caller's identity comes
// only from their own verified ID token (never a client-supplied uid), and
// the claim is only ever granted to the one hardcoded UID above. Everyone
// else gets a no-op 200, not an error - this isn't a permission check on the
// caller, it's just "am I the one account this claim ever applies to."
export async function POST(request) {
    try {
        const authHeader = request.headers.get('authorization') || '';
        const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!idToken) {
            return NextResponse.json({ success: false, error: 'Missing ID token' }, { status: 401 });
        }

        const adminAuth = await getAdminAuth();
        const decoded = await adminAuth.verifyIdToken(idToken);

        if (decoded.uid !== MASTER_ADMIN_UID) {
            return NextResponse.json({ success: true, granted: false });
        }

        if (decoded.isMasterAdmin === true) {
            // Already set from a previous login - avoid an unnecessary write.
            return NextResponse.json({ success: true, granted: true, alreadySet: true });
        }

        await adminAuth.setCustomUserClaims(MASTER_ADMIN_UID, { isMasterAdmin: true });
        return NextResponse.json({ success: true, granted: true });
    } catch (error) {
        console.error('Error setting admin claim:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
