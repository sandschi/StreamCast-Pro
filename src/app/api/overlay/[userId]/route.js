import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc, deleteDoc } from 'firebase/firestore';

export async function GET(request, { params }) {
    try {
        const userId = params.userId;
        const { searchParams } = new URL(request.url);
        const token = searchParams.get('token');
        const action = searchParams.get('action');

        if (!userId || !token || !action) {
            return NextResponse.json({ success: false, error: "Missing required parameters" }, { status: 400 });
        }

        // 1. Verify Token against User's Config
        const configRef = doc(db, 'users', userId, 'settings', 'config');
        const configSnap = await getDoc(configRef);

        if (!configSnap.exists()) {
            return NextResponse.json({ success: false, error: "User configuration not found" }, { status: 404 });
        }

        const configData = configSnap.data();

        // Ensure the token matches the stored token securely
        if (!configData.apiToken || configData.apiToken !== token) {
            return NextResponse.json({ success: false, error: "Unauthorized or invalid token" }, { status: 401 });
        }

        // 2. Perform Requested Action
        let newState = null;

        switch (action) {
            case 'toggle-karafun-queue':
                newState = !configData.karafunOverlayQueueEnabled;
                await updateDoc(configRef, { karafunOverlayQueueEnabled: newState });
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
                newState = !configData.karafunOverlayNowPlayingEnabled;
                await updateDoc(configRef, { karafunOverlayNowPlayingEnabled: newState });
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
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
