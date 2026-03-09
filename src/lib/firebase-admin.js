import admin from 'firebase-admin';

export function getAdminDb() {
    if (!admin.apps.length) {
        try {
            const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

            let privateKey = process.env.FIREBASE_PRIVATE_KEY;
            if (privateKey) {
                // Remove accidentally copied surrounding quotes from the JSON file
                if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
                    privateKey = privateKey.slice(1, -1);
                } else if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
                    privateKey = privateKey.slice(1, -1);
                }

                // Replace the literal string "\n" with actual newline characters
                privateKey = privateKey.replace(/\\n/g, '\n');
            }

            console.log("Initializing Firebase Admin with Project ID:", projectId ? "Found" : "Missing");

            // Check if we have the minimum required env vars to initialize
            if (projectId && clientEmail && privateKey) {
                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId: projectId,
                        clientEmail: clientEmail,
                        privateKey: privateKey,
                    }),
                });
            } else {
                // If it's Vercel build time, it's fine. If it's runtime, throw an error!
                if (process.env.npm_lifecycle_event === 'build') {
                    console.warn("FIREBASE_PROJECT_ID not found. Admin SDK will initialize with default behavior. (Expected during build)");
                    admin.initializeApp();
                } else {
                    console.warn("WARNING: Incomplete Firebase Admin credentials during runtime! Admin SDK may fail on database calls.");
                    console.warn(`ProjectID: ${!!projectId}, ClientEmail: ${!!clientEmail}, PrivateKey: ${!!privateKey}`);
                    admin.initializeApp();
                }
            }
        } catch (error) {
            console.error('Firebase admin initialization error', error.stack);
            throw error;
        }
    }
    return admin.firestore();
}
