import admin from 'firebase-admin';

export function getAdminDb() {
    if (!admin.apps.length) {
        try {
            const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

            let privateKey = process.env.FIREBASE_PRIVATE_KEY;
            if (privateKey) {
                try {
                    // Try parsing if it was accidentally pasted as a raw JSON string `"{...}"`
                    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
                        privateKey = JSON.parse(privateKey);
                    }
                } catch (e) { }

                // Ensure it's a real string with real newlines, stripped of carriage returns
                privateKey = privateKey.replace(/\\n/g, '\n').replace(/\r/g, '').trim();

                // Advanced Foolproof PEM Reconstructor (fixes bad spacing/wrapping from Vercel UI)
                const header = "-----BEGIN PRIVATE KEY-----";
                const footer = "-----END PRIVATE KEY-----";
                if (privateKey.includes(header) && privateKey.includes(footer)) {
                    // Extract just the base64 part, strip all spaces and newlines
                    let base64Body = privateKey
                        .substring(privateKey.indexOf(header) + header.length, privateKey.indexOf(footer))
                        .replace(/\s+/g, ""); // Remove all whitespace

                    // Re-wrap the base64 perfectly to 64 characters per line
                    const wrappedBody = base64Body.match(/.{1,64}/g).join('\n');
                    privateKey = `${header}\n${wrappedBody}\n${footer}\n`;
                }
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
