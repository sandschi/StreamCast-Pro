import { NextResponse } from 'next/server';
import admin from 'firebase-admin';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import {
    getKaraFunActionSpec, resolveRole, resolveSingerName, resolveQueueSingerName, buildKaraokeContext, authorize, MASTER_ADMIN_UID,
} from '@/lib/karafunCommands';
import { getPostHogClient, captureEvent } from '@/lib/posthog-server';

// Closes issue #29: today's src/hooks/useKaraFunData.js emits straight to a
// client-opened KaraFun socket, gated only by a client-side canControl check
// (role only, no turn/ownership scoping - see docs/karafun-relay-design.md
// §0). This route is the real authorization boundary the app never had -
// see §3.1/§3.3. It only ever writes a *pending* command doc; the actual
// KaraFun socket.io emit happens in relay/, the one process that holds that
// party's connection (§1/§4).
export async function POST(request, { params }) {
    const posthogClient = getPostHogClient();
    let userId;
    try {
        ({ userId } = await params);

        const authHeader = request.headers.get('authorization') || '';
        const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (!idToken) {
            return NextResponse.json({ success: false, error: 'Missing ID token' }, { status: 401 });
        }

        const adminAuth = await getAdminAuth();
        let decoded;
        try {
            decoded = await adminAuth.verifyIdToken(idToken);
        } catch {
            return NextResponse.json({ success: false, error: 'Invalid ID token' }, { status: 401 });
        }
        const callerUid = decoded.uid;

        const body = await request.json().catch(() => null);
        const action = body?.action;
        const spec = getKaraFunActionSpec(action);
        if (!spec) {
            return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
        }

        let validatedParams;
        try {
            validatedParams = spec.validate(body?.params || {});
        } catch (e) {
            return NextResponse.json({ success: false, error: e.message }, { status: 400 });
        }

        const db = await getAdminDb();
        // Same OR fallback firestore.rules' isMasterAdmin() uses - see that
        // function's own comment for why the hardcoded UID stays as a
        // fallback alongside the custom claim.
        const isMasterAdminClaim = decoded.isMasterAdmin === true || callerUid === MASTER_ADMIN_UID;
        const role = isMasterAdminClaim ? 'broadcaster' : await resolveRole(db, userId, callerUid);
        const singerName = await resolveSingerName(db, callerUid, decoded);
        const context = await buildKaraokeContext(db, userId);

        // addToQueue's singer field is otherwise just whatever the client
        // sent - a singer-role caller could queue a song under someone
        // else's name with nothing to stop them. Re-derive it server-side
        // for that role only; broadcaster/mod may name anyone (see
        // authorize()'s own exemption for those roles).
        if (action === 'addToQueue' && role === 'singer' && !isMasterAdminClaim) {
            const resolvedSinger = await resolveQueueSingerName(db, userId, callerUid, singerName, validatedParams.singer);
            if (!resolvedSinger) {
                return NextResponse.json({ success: false, error: 'singer must be your own name or an accepted duet invite' }, { status: 403 });
            }
            validatedParams = { ...validatedParams, singer: resolvedSinger };
        }

        const decision = authorize({ action, params: validatedParams, role, isMasterAdminClaim, callerUid, singerName, context });
        if (!decision.ok) {
            await captureEvent(posthogClient, userId, 'karafun_command_denied', {
                action, role, reason: decision.reason, requestedBy: callerUid,
            }, true);
            return NextResponse.json({ success: false, error: decision.reason || 'Forbidden' }, { status: 403 });
        }

        const commandRef = await db.collection(`users/${userId}/karafun_commands`).add({
            action,
            params: validatedParams,
            requestedBy: callerUid,
            requestedByRole: role,
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await captureEvent(posthogClient, userId, 'karafun_command_queued', {
            action, role, commandId: commandRef.id,
        }, true);
        return NextResponse.json({ success: true, commandId: commandRef.id });
    } catch (error) {
        console.error('Error in karafun command API:', error);
        await captureEvent(posthogClient, userId || 'anonymous', 'karafun_command_error', {
            error: error instanceof Error ? error.message : String(error),
        }, true);
        return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
    }
}
