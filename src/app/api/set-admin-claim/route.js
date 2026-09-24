import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

// Same hardcoded UID the RLS policies' is_master_admin() effectively checks
// against (via app_metadata.is_master_admin, set here) - see supabase/schema
// for why this stays hardcoded rather than moving to any client-supplied or
// table-field value. Firebase's UID doesn't carry over to Supabase's UUIDs
// (see migration plan §8), so this is the new value from the master admin's
// real Twitch login against the new stack.
const MASTER_ADMIN_UID = '4a0c4f9e-2f6c-49e7-a8b1-815fc0b6ad3d';

// Safe to call on every login for every user: the caller's identity comes
// only from their own verified access token (never a client-supplied uid),
// and the claim is only ever granted to the one hardcoded UID above. Everyone
// else gets a no-op 200, not an error - this isn't a permission check on the
// caller, it's just "am I the one account this claim ever applies to."
export async function POST(request) {
    try {
        const authHeader = request.headers.get('authorization') || '';
        const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!accessToken) {
            return NextResponse.json({ success: false, error: 'Missing access token' }, { status: 401 });
        }

        const supabaseAdmin = getSupabaseAdmin();
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
        if (error || !user) {
            return NextResponse.json({ success: false, error: 'Invalid access token' }, { status: 401 });
        }

        if (user.id !== MASTER_ADMIN_UID) {
            return NextResponse.json({ success: true, granted: false });
        }

        if (user.app_metadata?.is_master_admin === true) {
            // Already set from a previous login - avoid an unnecessary write.
            return NextResponse.json({ success: true, granted: true, alreadySet: true });
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(MASTER_ADMIN_UID, {
            app_metadata: { is_master_admin: true },
        });
        if (updateError) throw updateError;

        return NextResponse.json({ success: true, granted: true });
    } catch (error) {
        console.error('Error setting admin claim:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
