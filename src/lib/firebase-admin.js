import admin from 'firebase-admin';

export function getAdminDb() {
    if (!admin.apps.length) {
        try {
            // Check if we have the minimum required env vars to initialize
            if (process.env.FIREBASE_PROJECT_ID) {
                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId: process.env.FIREBASE_PROJECT_ID,
                        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
                    }),
                });
            } else {
                console.warn("FIREBASE_PROJECT_ID not found. Admin SDK will initialize with default behavior. (Expected during build)");
                admin.initializeApp();
            }
        } catch (error) {
            console.error('Firebase admin initialization error', error.stack);
        }
    }
    return admin.firestore();
}
