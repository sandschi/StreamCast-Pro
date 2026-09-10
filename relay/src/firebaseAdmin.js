'use strict';

const admin = require('firebase-admin');

let initialized = false;

// Same defensive PEM reconstruction as src/lib/firebase-admin.js in the main
// Next.js app - ported rather than shared, since this runs as a separate
// Node process/Docker image with its own package.json, not through Next's
// build. Keep this in sync by hand if that file's logic changes; it exists
// for the same reason there: different hosting environments (Vercel there,
// Dokploy here) have both been observed mangling FIREBASE_PRIVATE_KEY.
function normalizePrivateKey(raw) {
    let privateKey = raw;
    try {
        if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
            privateKey = JSON.parse(privateKey);
        }
    } catch (e) {
        // not JSON-wrapped - use as-is
    }

    privateKey = privateKey.replace(/\\n/g, '\n').replace(/\r/g, '').trim();

    const header = '-----BEGIN PRIVATE KEY-----';
    const footer = '-----END PRIVATE KEY-----';
    if (privateKey.includes(header) && privateKey.includes(footer)) {
        const base64Body = privateKey
            .substring(privateKey.indexOf(header) + header.length, privateKey.indexOf(footer))
            .replace(/\s+/g, '');
        if (base64Body.length > 0) {
            const matches = base64Body.match(/.{1,64}/g);
            const wrappedBody = matches ? matches.join('\n') : '';
            privateKey = `${header}\n${wrappedBody}\n${footer}\n`;
        }
    }
    return privateKey;
}

function initAdmin() {
    if (initialized) return;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    let privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!projectId || !clientEmail || !privateKey) {
        const missing = [];
        if (!projectId) missing.push('FIREBASE_PROJECT_ID');
        if (!clientEmail) missing.push('FIREBASE_CLIENT_EMAIL');
        if (!privateKey) missing.push('FIREBASE_PRIVATE_KEY');
        throw new Error(`Missing Firebase Admin credentials: ${missing.join(', ')}`);
    }

    privateKey = normalizePrivateKey(privateKey);

    admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    initialized = true;
}

function getDb() {
    initAdmin();
    return admin.firestore();
}

module.exports = { getDb, admin };
