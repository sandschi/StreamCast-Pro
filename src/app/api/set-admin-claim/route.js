import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { hasMasterAdminTwitchIdentity } from '@/lib/masterAdmin';

// Safe to call on every login for every user: the caller's identity comes
// only from their own verified access token (never a client-supplied uid),
// and the claim is only ever granted to the account linked to the master
// admin's Twitch user ID (see src/lib/masterAdmin.js). Keyed off the Twitch
// ID rather than the Supabase UUID because the UUID changes on every
// auth.users wipe - which used to leave a fresh post-reset login unable to
// get the claim at all. Everyone else gets a no-op 200, not an error - this
// isn't a permission check on the caller, it's just "am I the one account
// this claim ever applies to."
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

        if (!hasMasterAdminTwitchIdentity(user)) {
            return NextResponse.json({ success: true, granted: false });
        }

        if (user.app_metadata?.is_master_admin === true) {
            // Already set from a previous login - avoid an unnecessary write.
            return NextResponse.json({ success: true, granted: true, alreadySet: true });
        }

        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            app_metadata: { is_master_admin: true },
        });
        if (updateError) throw updateError;

        return NextResponse.json({ success: true, granted: true });
    } catch (error) {
        console.error('Error setting admin claim:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
