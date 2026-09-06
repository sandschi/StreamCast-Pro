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
// queuing every matched doc into one batch.
async function deleteInChunks(refs) {
  for (let i = 0; i < refs.length; i += 500) {
    const batch = db.batch();
    for (const ref of refs.slice(i, i + 500)) batch.delete(ref);
    await batch.commit();
  }
}

// Covers the three chat-approval-pipeline collections cleanup-history.js and
// cleanup-karaoke-requests.js don't touch: a viewer suggestion nobody ever
// approved/declined, a queued message nobody ever showed/removed, or a
// "permanent" (duration: -1) active_message left on the overlay indefinitely
// all had no automatic expiry before this - only reactive deletion via a
// Twitch CLEARMSG/timeout/ban signal (see useChatData.js). Same 30-day
// rolling window as chat history, same `timestamp` field every one of these
// three write paths already sets (see useChatData.js's sendToScreen,
// queueMessage, and approveSuggestion).
async function cleanupChatPipeline() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  console.log(`Cleaning up chat-pipeline leftovers older than ${thirtyDaysAgo.toISOString()}...`);

  const usersSnapshot = await db.collection('users').get();

  for (const userDoc of usersSnapshot.docs) {
    // suggestions and message_queue are plain collections - query + delete,
    // same pattern as the other cleanup scripts.
    for (const col of ['suggestions', 'message_queue']) {
      const colRef = db.collection('users').doc(userDoc.id).collection(col);
      const snapshot = await colRef.where('timestamp', '<', thirtyDaysAgo).get();
      if (snapshot.empty) continue;

      console.log(`Found ${snapshot.size} old ${col} docs for user ${userDoc.id}. Deleting...`);
      await deleteInChunks(snapshot.docs.map((doc) => doc.ref));
    }

    // active_message/current is a single doc per user, not a collection -
    // check it directly rather than querying. Only ever relevant to a
    // permanent message, since a finite-duration one already expires
    // client-side (see useChatData.js's queue-advance effect).
    const activeRef = db.collection('users').doc(userDoc.id).collection('active_message').doc('current');
    const activeSnap = await activeRef.get();
    if (activeSnap.exists) {
      const ts = activeSnap.data().timestamp;
      if (ts && ts.toDate() < thirtyDaysAgo) {
        console.log(`Clearing stale active_message for user ${userDoc.id}.`);
        await activeRef.delete();
      }
    }
  }

  console.log('Cleanup complete.');
}

cleanupChatPipeline().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
