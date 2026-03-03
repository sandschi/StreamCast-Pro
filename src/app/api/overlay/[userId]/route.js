import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { adminDb } from '@/lib/firebase-admin';
import { PostHog } from 'posthog-node';

let posthogClient = null;
try {
    posthogClient = new PostHog(
        process.env.NEXT_PUBLIC_POSTHOG_KEY || 'phc_placeholder',
        { host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com', flushAt: 1, flushInterval: 0 }
    );
} catch (e) {
    console.warn("PostHog initialization failed:", e);
}

export async function GET() {
    return NextResponse.json({ success: false, error: "Method Not Allowed. Please use POST with a Bearer token." }, { status: 405 });
}

export async function POST(request, { params }) {
    try {
        const { userId } = await params;
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');

        if (posthogClient) {
            posthogClient.capture({
                distinctId: userId || 'anonymous',
                event: 'api_overlay_request_started',
                properties: {
                    action: action,
                    userId: userId,
                }
            });
        }

        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            const errorMsg = "Missing or invalid Authorization header";
            if (posthogClient) {
                posthogClient.capture({
                    distinctId: userId || 'anonymous',
                    event: 'api_overlay_error',
                    properties: { error: errorMsg, status: 401, action: action, userId: userId }
                });
                await posthogClient.flush();
            }
            return NextResponse.json({ success: false, error: errorMsg }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];

        if (!userId || !token || !action) {
            const errorMsg = "Missing required parameters";
            if (posthogClient) {
                posthogClient.capture({
                    distinctId: userId || 'anonymous',
                    event: 'api_overlay_error',
                    properties: { error: errorMsg, status: 400, action: action, userId: userId }
                });
                await posthogClient.flush();
            }
            return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
        }

        // 1. Verify Token against User's Private Config
        const privateConfigRef = adminDb.collection('users').doc(userId).collection('private').doc('config');
        const privateConfigSnap = await privateConfigRef.get();

        if (!privateConfigSnap.exists) {
            const errorMsg = "Authentication configuration not found";
            if (posthogClient) {
                posthogClient.capture({
                    distinctId: userId || 'anonymous',
                    event: 'api_overlay_error',
                    properties: { error: errorMsg, status: 404, action: action, userId: userId }
                });
                await posthogClient.flush();
            }
            return NextResponse.json({ success: false, error: errorMsg }, { status: 404 });
        }

        const privateConfigData = privateConfigSnap.data();

        // Ensure the token matches the stored token securely
        if (!privateConfigData.apiToken) {
            const errorMsg = "Unauthorized or invalid token";
            if (posthogClient) {
                posthogClient.capture({
                    distinctId: userId || 'anonymous',
                    event: 'api_overlay_error',
                    properties: { error: errorMsg, status: 401, action: action, userId: userId }
                });
                await posthogClient.flush();
            }
            return NextResponse.json({ success: false, error: errorMsg }, { status: 401 });
        }

        const storedTokenBuffer = Buffer.from(privateConfigData.apiToken);
        const providedTokenBuffer = Buffer.from(token);

        if (storedTokenBuffer.length !== providedTokenBuffer.length || !crypto.timingSafeEqual(storedTokenBuffer, providedTokenBuffer)) {
            const errorMsg = "Unauthorized or invalid token";
            if (posthogClient) {
                posthogClient.capture({
                    distinctId: userId || 'anonymous',
                    event: 'api_overlay_error',
                    properties: { error: errorMsg, status: 401, action: action, userId: userId }
                });
                await posthogClient.flush();
            }
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
                    if (!sfDoc.exists) throw new Error("Document does not exist!");
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
                    if (!sfDoc.exists) throw new Error("Document does not exist!");
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
            case 'hide-message':
                // Hide message deletes the current active message document
                const msgRef = adminDb.collection('users').doc(userId).collection('active_message').doc('current');
                await msgRef.delete();
                if (posthogClient) {
                    posthogClient.capture({
                        distinctId: userId || 'anonymous',
                        event: 'api_overlay_success',
                        properties: { action: action, userId: userId, message_hidden: true }
                    });
                    await posthogClient.flush();
                }
                return NextResponse.json({ success: true, action: action, message_hidden: true });
            default:
                const errorMsg = "Invalid action";
                if (posthogClient) {
                    posthogClient.capture({
                        distinctId: userId || 'anonymous',
                        event: 'api_overlay_error',
                        properties: { error: errorMsg, status: 400, action: action, userId: userId }
                    });
                    await posthogClient.flush();
                }
                return NextResponse.json({ success: false, error: errorMsg }, { status: 400 });
        }

        if (posthogClient) {
            posthogClient.capture({
                distinctId: userId || 'anonymous',
                event: 'api_overlay_success',
                properties: { action: action, state: newState, userId: userId }
            });
            await posthogClient.flush();
        }
        return NextResponse.json({ success: true, action: action, state: newState });

    } catch (error) {
        console.error("Error in overlay API:", error);

        const isNotFound = error?.code === 'not-found' || error?.message?.includes('No document to update');
        const status = isNotFound ? 404 : 500;
        const errorMsg = isNotFound ? "Settings configuration not found" : "Internal server error";

        if (posthogClient) {
            try {
                posthogClient.capture({
                    distinctId: 'anonymous', // we might not have userId if it failed early
                    event: 'api_overlay_error',
                    properties: {
                        error: errorMsg,
                        status: status,
                        exception: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined
                    }
                });
                await posthogClient.flush();
            } catch (posthogError) {
                console.error("Failed to send error to PostHog:", posthogError);
            }
        }

        if (isNotFound) {
            return NextResponse.json({ success: false, error: errorMsg }, { status: 404 });
        }
        return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
    }
}
