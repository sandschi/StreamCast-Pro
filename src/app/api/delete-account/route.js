import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { decryptToken } from '@/lib/tokenCrypto';

// Same hardcoded UID is_master_admin() effectively checks (via
// app_metadata.is_master_admin, set in /api/set-admin-claim) - self-deleting
// this account would strand the app, so it's blocked here rather than
// relying on the caller's own good judgment in the UI.
const MASTER_ADMIN_UID = '4a0c4f9e-2f6c-49e7-a8b1-815fc0b6ad3d';

// Best-effort: tells Twitch itself to forget this app's authorization, so a
// deleted account doesn't silently skip Twitch's consent screen on a future
// login just because Twitch still considers the grant active. Must not block
// deletion if it fails (expired/already-revoked token, Twitch API hiccup).
// Bounded with an AbortController: an ordinary rejection is already caught
// below, but a request that just never resolves (Twitch hangs, network
// stalls) isn't a rejection at all - without a timeout it would hold up
// deletion indefinitely instead of skipping past it like every other
// failure here.
async function revokeTwitchToken(accessToken) {
    const clientId = process.env.NEXT_PUBLIC_TWITCH_CLIENT_ID;
    if (!clientId || !accessToken) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
        await fetch('https://id.twitch.tv/oauth2/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: clientId, token: accessToken }),
            signal: controller.signal,
        });
    } catch (e) {
        console.error('Error revoking Twitch token (non-fatal):', e);
    } finally {
        clearTimeout(timeout);
    }
}

// Deletes a user's own account. Unlike the Firestore version, this is now
// just one call: every table in the schema FKs to public.users.id (which FKs
// to auth.users.id) with ON DELETE CASCADE - including online.viewer_id and
// permissions.viewer_id, the two columns that used to need a manual
// collectionGroup scan to find this uid's footprint on *other* broadcasters'
// channels. supabaseAdmin.auth.admin.deleteUser() cascades through all of it
// atomically - no partial-failure window, so unlike the Firestore version
// there's no pending_cleanup_sweeps-style retry queue needed either (see
// migration plan §5).
export async function POST(request) {
    try {
        const authHeader = request.headers.get('authorization') || '';
        const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!accessToken) {
            return NextResponse.json({ success: false, error: 'Missing access token' }, { status: 401 });
        }

        const supabaseAdmin = getSupabaseAdmin();
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
        if (authError || !user) {
            return NextResponse.json({ success: false, error: 'Invalid access token' }, { status: 401 });
        }
        const uid = user.id;

        if (uid === MASTER_ADMIN_UID) {
            return NextResponse.json({ success: false, error: 'The master admin account cannot be self-deleted.' }, { status: 403 });
        }

        // Revoke on Twitch's side before the token itself is wiped by the
        // cascade below. Wrapped separately: a decrypt failure here (bad key
        // config, corrupted ciphertext) must never block the account
        // deletion itself - that would turn a broken revoke into an
        // undeletable account, which is a worse outcome than just skipping it.
        try {
            const { data: tokenRow } = await supabaseAdmin
                .from('private_twitch_tokens')
                .select('access_token_encrypted')
                .eq('user_id', uid)
                .maybeSingle();
            if (tokenRow?.access_token_encrypted) {
                await revokeTwitchToken(decryptToken(tokenRow.access_token_encrypted));
            }
        } catch (e) {
            console.error('Error preparing Twitch token revocation (non-fatal):', e);
        }

        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(uid);
        if (deleteError) throw deleteError;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting account:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
