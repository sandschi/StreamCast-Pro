import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { encryptToken, decryptToken } from '@/lib/tokenCrypto';

// Twitch OAuth token, encrypted at rest (see src/lib/tokenCrypto.js, unchanged
// - pure Node crypto, fully DB-agnostic). RLS denies the client SDK any
// access to private_twitch_tokens at all - this route (service-role, which
// bypasses RLS) is the only read/write path, and it only ever acts on the
// caller's own uid, taken from their verified access token, never a
// client-supplied one.
async function verifyCaller(request) {
    const authHeader = request.headers.get('authorization') || '';
    const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!accessToken) return null;
    try {
        const supabaseAdmin = getSupabaseAdmin();
        const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);
        if (error || !user) return null;
        return user.id;
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

        const supabaseAdmin = getSupabaseAdmin();
        const { error } = await supabaseAdmin.from('private_twitch_tokens').upsert({
            user_id: uid,
            access_token_encrypted: encryptToken(accessToken),
            updated_at: new Date().toISOString(),
        });
        if (error) throw error;

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

        const supabaseAdmin = getSupabaseAdmin();
        const { data, error } = await supabaseAdmin
            .from('private_twitch_tokens')
            .select('access_token_encrypted')
            .eq('user_id', uid)
            .maybeSingle();
        if (error) throw error;

        if (!data?.access_token_encrypted) {
            return NextResponse.json({ success: true, accessToken: null });
        }
        return NextResponse.json({ success: true, accessToken: decryptToken(data.access_token_encrypted) });
    } catch (error) {
        console.error('Error reading Twitch token:', error);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
