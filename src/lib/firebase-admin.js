import admin from 'firebase-admin';

let initPromise = null;

export async function getAdminDb() {
    // 1. If already initialized, return immediately
    if (admin.apps.length) {
        return admin.firestore();
    }

    // 2. If initialization is currently in progress, wait for it
    if (initPromise) {
        await initPromise;
        return admin.firestore();
    }

    // 3. Otherwise, claim the initialization lock
    initPromise = (async () => {
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

                // Advanced Foolproof PEM Reconstructor
                const header = "-----BEGIN PRIVATE KEY-----";
                const footer = "-----END PRIVATE KEY-----";
                if (privateKey.includes(header) && privateKey.includes(footer)) {
                    // Extract just the base64 part, strip all spaces and newlines
                    let base64Body = privateKey
                        .substring(privateKey.indexOf(header) + header.length, privateKey.indexOf(footer))
                        .replace(/\s+/g, ""); // Remove all whitespace

                    if (base64Body.length > 0) {
                        // Re-wrap the base64 perfectly to 64 characters per line safely
                        const matches = base64Body.match(/.{1,64}/g);
                        const wrappedBody = matches ? matches.join('\n') : "";
                        privateKey = `${header}\n${wrappedBody}\n${footer}\n`;
                    }
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
                const isBuildTime = process.env.IS_BUILD_TIME === 'true' || process.env.NEXT_PHASE === 'phase-build' || process.env.npm_lifecycle_event === 'build';

                // If it's Vercel build time, it's fine. If it's runtime, throw an error!
                if (isBuildTime) {
                    console.warn("FIREBASE_PROJECT_ID not found. Admin SDK will initialize with default behavior. (Expected during build)");
                    admin.initializeApp();
                } else {
                    const missingVars = [];
                    if (!projectId) missingVars.push('FIREBASE_PROJECT_ID');
                    if (!clientEmail) missingVars.push('FIREBASE_CLIENT_EMAIL');
                    if (!privateKey) missingVars.push('FIREBASE_PRIVATE_KEY');
                    throw new Error(`Incomplete Firebase Admin credentials during runtime! Missing: ${missingVars.join(', ')}`);
                }
            }
        } catch (error) {
            console.error('Firebase admin initialization error', error.stack);
            throw error;
        }
    })();

    const init = initPromise;
    try {
        await init;
    } finally {
        if (initPromise === init) {
            initPromise = null;
        }
    }

    return admin.firestore();
}
