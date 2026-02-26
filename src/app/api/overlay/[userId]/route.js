import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, deleteDoc, runTransaction } from 'firebase/firestore';

export async function GET() {
    return NextResponse.json({ success: false, error: "Method Not Allowed. Please use POST with a Bearer token." }, { status: 405 });
}

export async function POST(request, { params }) {
    try {
        const { userId } = await params;
        const { searchParams } = new URL(request.url);
        const action = searchParams.get('action');

        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ success: false, error: "Missing or invalid Authorization header" }, { status: 401 });
        }

        const token = authHeader.split(' ')[1];

        if (!userId || !token || !action) {
            return NextResponse.json({ success: false, error: "Missing required parameters" }, { status: 400 });
        }

        // 1. Verify Token against User's Private Config
        const privateConfigRef = doc(db, 'users', userId, 'private', 'config');
        const privateConfigSnap = await getDoc(privateConfigRef);

        if (!privateConfigSnap.exists()) {
            return NextResponse.json({ success: false, error: "Authentication configuration not found" }, { status: 404 });
        }

        const privateConfigData = privateConfigSnap.data();

        // Ensure the token matches the stored token securely
        if (!privateConfigData.apiToken || privateConfigData.apiToken !== token) {
            return NextResponse.json({ success: false, error: "Unauthorized or invalid token" }, { status: 401 });
        }

        // 2. Fetch User's Overlay Settings
        const configRef = doc(db, 'users', userId, 'settings', 'config');
        const configSnap = await getDoc(configRef);

        if (!configSnap.exists()) {
            return NextResponse.json({ success: false, error: "Settings configuration not found" }, { status: 404 });
        }

        const configData = configSnap.data();

        // 2. Perform Requested Action
        let newState = null;

        switch (action) {
            case 'toggle-karafun-queue':
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(configRef);
                    if (!sfDoc.exists()) throw new Error("Document does not exist!");
                    newState = !sfDoc.data().karafunOverlayQueueEnabled;
                    transaction.update(configRef, { karafunOverlayQueueEnabled: newState });
                });
                break;
            case 'karafun-queue-on':
                newState = true;
                await updateDoc(configRef, { karafunOverlayQueueEnabled: true });
                break;
            case 'karafun-queue-off':
                newState = false;
                await updateDoc(configRef, { karafunOverlayQueueEnabled: false });
                break;
            case 'toggle-now-playing':
                await runTransaction(db, async (transaction) => {
                    const sfDoc = await transaction.get(configRef);
                    if (!sfDoc.exists()) throw new Error("Document does not exist!");
                    newState = !sfDoc.data().karafunOverlayNowPlayingEnabled;
                    transaction.update(configRef, { karafunOverlayNowPlayingEnabled: newState });
                });
                break;
            case 'now-playing-on':
                newState = true;
                await updateDoc(configRef, { karafunOverlayNowPlayingEnabled: true });
                break;
            case 'now-playing-off':
                newState = false;
                await updateDoc(configRef, { karafunOverlayNowPlayingEnabled: false });
                break;
            case 'hide-message':
                // Hide message deletes the current active message document
                const msgRef = doc(db, 'users', userId, 'active_message', 'current');
                await deleteDoc(msgRef);
                return NextResponse.json({ success: true, action: action, message_hidden: true });
            default:
                return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
        }

        return NextResponse.json({ success: true, action: action, state: newState });

    } catch (error) {
        console.error("Error in overlay API:", error);
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
    }
}
