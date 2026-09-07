const admin = require('firebase-admin');

// NOTE: You must have GOOGLE_APPLICATION_CREDENTIALS set or use a service account JSON
// For local run, you can provide the path to your service account key.
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('Please set FIREBASE_SERVICE_ACCOUNT environment variable (JSON string)');
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Firestore caps a single batch at 500 writes - commit in chunks rather than
// queuing every matched doc into one batch, which would throw and leave a
// user with >500 stale requests never cleaned up.
async function deleteInChunks(refs) {
  for (let i = 0; i < refs.length; i += 500) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 500)) batch.delete(ref);
    await batch.commit();
  }
}

async function cleanupKaraokeRequests() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  console.log(`Cleaning up karaoke requests older than ${thirtyDaysAgo.toISOString()}...`);

  // Same per-user iteration pattern as cleanup-history.js, kept consistent
  // rather than switching to a collectionGroup query, so both scripts read
  // the same way at a glance.
  const usersSnapshot = await db.collection('users').get();

  for (const userDoc of usersSnapshot.docs) {
    const requestsRef = db.collection('users').doc(userDoc.id).collection('karaoke_requests');
    const oldRequestsQuery = requestsRef.where('createdAt', '<', thirtyDaysAgo);

    const snapshot = await oldRequestsQuery.get();
    if (snapshot.empty) continue;

    console.log(`Found ${snapshot.size} old karaoke requests for user ${userDoc.id}. Deleting...`);

    await deleteInChunks(snapshot.docs.map((doc) => doc.ref));
  }

  console.log('Cleanup complete.');
}

cleanupKaraokeRequests().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
