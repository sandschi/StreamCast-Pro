import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { getPostHogClient, captureEvent } from '@/lib/posthog-server';

export async function GET(request, { params }) {
    const posthogClient = getPostHogClient();
    try {
        const { userId } = await params;
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');
        const token = searchParams.get('token');

        await captureEvent(posthogClient, userId, 'api_overlay_request_started', {
            action: action,
            userId: userId,
        });

        if (!userId || !token || !action) {
            const errorMsg = "Missing required parameters";
            await captureEvent(posthogClient, userId, 'api_overlay_error', { error: errorMsg, status: 400, action: action, userId: userId }, true);
            return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
        }

        const adminDb = await getAdminDb();

        // 1. Verify Token against User's Private Config
        const privateConfigRef = adminDb.collection('users').doc(userId).collection('private').doc('config');
        const privateConfigSnap = await privateConfigRef.get();

        if (!privateConfigSnap.exists) {
            const errorMsg = "Authentication configuration not found";
            await captureEvent(posthogClient, userId, 'api_overlay_error', { error: errorMsg, status: 404, action: action, userId: userId }, true);
            return NextResponse.json({ success: false, error: errorMsg }, { status: 404 });
        }

        const privateConfigData = privateConfigSnap.data();

        // Ensure the token matches the stored token securely
        if (!privateConfigData.apiToken) {
            const errorMsg = "Unauthorized or invalid token";
            await captureEvent(posthogClient, userId, 'api_overlay_error', { error: errorMsg, status: 401, action: action, userId: userId }, true);
            return NextResponse.json({ success: false, error: errorMsg }, { status: 401 });
        }

        const storedTokenBuffer = Buffer.from(privateConfigData.apiToken);
        const providedTokenBuffer = Buffer.from(token);

        if (storedTokenBuffer.length !== providedTokenBuffer.length || !crypto.timingSafeEqual(storedTokenBuffer, providedTokenBuffer)) {
            const errorMsg = "Unauthorized or invalid token";
            await captureEvent(posthogClient, userId, 'api_overlay_error', { error: errorMsg, status: 401, action: action, userId: userId }, true);
            return NextResponse.json({ success: false, error: errorMsg }, { status: 401 });
        }

        // 2. Perform Requested Action
        const configRef = adminDb.collection('users').doc(userId).collection('settings').doc('config');

        // 2. Perform Requested Action
        let newState = null;

        switch (action) {
            case 'toggle-karafun-queue':
                await adminDb.runTransaction(async (transaction) => {
                    const sfDoc = await transaction.get(configRef);
                    if (!sfDoc.exists) throw new Error("No document to update");
                    newState = !sfDoc.data().karafunOverlayQueueEnabled;
                    transaction.update(configRef, { karafunOverlayQueueEnabled: newState });
                });
                break;
            case 'karafun-queue-on':
                newState = true;
                await configRef.update({ karafunOverlayQueueEnabled: true });
                break;
            case 'karafun-queue-off':
                newState = false;
                await configRef.update({ karafunOverlayQueueEnabled: false });
                break;
            case 'toggle-now-playing':
                await adminDb.runTransaction(async (transaction) => {
                    const sfDoc = await transaction.get(configRef);
                    if (!sfDoc.exists) throw new Error("No document to update");
                    newState = !sfDoc.data().karafunOverlayNowPlayingEnabled;
                    transaction.update(configRef, { karafunOverlayNowPlayingEnabled: newState });
                });
                break;
            case 'now-playing-on':
                newState = true;
                await configRef.update({ karafunOverlayNowPlayingEnabled: true });
                break;
            case 'now-playing-off':
                newState = false;
                await configRef.update({ karafunOverlayNowPlayingEnabled: false });
                break;
            case 'hide-message': {
                // Hide message deletes the current active message document
                const msgRef = adminDb.collection('users').doc(userId).collection('active_message').doc('current');
                await msgRef.delete();
                await captureEvent(posthogClient, userId, 'api_overlay_success', { action: action, userId: userId, message_hidden: true }, true);
                return NextResponse.json({ success: true, action: action, message_hidden: true });
            }
            case 'show-now-playing': {
                // Manually trigger the Now Playing popup by writing a trigger document
                const triggerRef = adminDb.collection('users').doc(userId).collection('overlay_triggers').doc('now_playing');
                await triggerRef.set({ triggeredAt: new Date().toISOString() });
                await captureEvent(posthogClient, userId, 'api_overlay_success', { action: action, userId: userId }, true);
                return NextResponse.json({ success: true, action: action });
            }
            case 'hide-now-playing': {
                // Manually dismiss the Now Playing popup
                const triggerRef = adminDb.collection('users').doc(userId).collection('overlay_triggers').doc('now_playing');
                await triggerRef.delete();
                await captureEvent(posthogClient, userId, 'api_overlay_success', { action: action, userId: userId }, true);
                return NextResponse.json({ success: true, action: action });
            }
            default:
                const errorMsg = "Invalid action";
                await captureEvent(posthogClient, userId, 'api_overlay_error', { error: errorMsg, status: 400, action: action, userId: userId }, true);
                return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
        }

        await captureEvent(posthogClient, userId, 'api_overlay_success', { action: action, state: newState, userId: userId }, true);
        return NextResponse.json({ success: true, action: action, state: newState });

    } catch (error) {
        console.error("Error in overlay API:", error);

        const isNotFound = error?.code === 'not-found' || error?.message?.includes('No document to update');
        const status = isNotFound ? 404 : 500;
        let errorMsg = isNotFound ? "Settings configuration not found" : "Internal server error";

        const rawErrorMsg = error instanceof Error ? error.message : String(error);

        if (rawErrorMsg.includes('DECODER') || rawErrorMsg.includes('metadata')) {
            const pk = process.env.FIREBASE_PRIVATE_KEY || "";
            const hasQuotes = pk.startsWith('"') || pk.startsWith("'");
            const literalNCount = (pk.match(/\\n/g) || []).length;
            const realNCount = (pk.match(/\n/g) || []).length;
            const hasHeader = pk.includes('BEGIN PRIVATE KEY');
            console.error(`Firebase Private Key Debug Data | Len=${pk.length}, Quotes=${hasQuotes}, LitN=${literalNCount}, RealN=${realNCount}, Header=${hasHeader}`);
        }

        await captureEvent(posthogClient, 'anonymous', 'api_overlay_error', {
            error: errorMsg,
            status: status,
            exception: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        }, true);

        if (isNotFound) {
            return NextResponse.json({ success: false, error: errorMsg }, { status: 404 });
        }
        return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
    }
}
