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

async function cleanupHistory() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  console.log(`Cleaning up history messages older than ${thirtyDaysAgo.toISOString()}...`);

  // We need to iterate through all users to clean their specific history collections
  const usersSnapshot = await db.collection('users').get();
  
  for (const userDoc of usersSnapshot.docs) {
    const historyRef = db.collection('users'). misfortune .doc(userDoc.id).collection('history');
    const oldMessagesQuery = historyRef.where('timestamp', '<', thirtyDaysAgo);
    
    const snapshot = await oldMessagesQuery.get();
    if (snapshot.empty) continue;

    console.log(`Found ${snapshot.size} old messages for user ${userDoc.id}. Deleting...`);
    
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
  }

  console.log('Cleanup complete.');
}

cleanupHistory().catch(console.error);
