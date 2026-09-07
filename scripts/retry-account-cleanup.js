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

// Finishes whatever src/app/api/delete-account/route.js couldn't complete at
// deletion time - see the pendingRef comment there for why this has to be a
// durable retry rather than a dropped error: once an account is deleted
// there's no user record left to identify what still needs cleaning up, so
// a queued record here is the only remaining trail.
async function retryAccountCleanup() {
  console.log('Retrying queued account-deletion cleanups...');

  const pendingSnapshot = await db.collection('pending_cleanup_sweeps').get();
  if (pendingSnapshot.empty) {
    console.log('Nothing queued.');
    return;
  }

  // One full permissions/online collection-group scan for the whole run,
  // not one per pending uid - the scan cost is the same either way, so
  // repeating it per doc only multiplies read volume against a backlog
  // that's already an edge case (a double Firestore failure at deletion
  // time - see the pendingRef comment in delete-account/route.js).
  const needsCrossChannelSweep = pendingSnapshot.docs.some((d) => d.data().crossChannelSweep?.pending);
  let staleRefsByUid = null;
  if (needsCrossChannelSweep) {
    try {
      const [permsSnap, onlineSnap] = await Promise.all([
        db.collectionGroup('permissions').get(),
        db.collectionGroup('online').get(),
      ]);
      staleRefsByUid = new Map();
      for (const d of [...permsSnap.docs, ...onlineSnap.docs]) {
        if (!staleRefsByUid.has(d.id)) staleRefsByUid.set(d.id, []);
        staleRefsByUid.get(d.id).push(d.ref);
      }
    } catch (e) {
      console.error('Cross-channel collection-group scan failed - all pending sweeps stay queued:', e);
    }
  }

  for (const pendingDoc of pendingSnapshot.docs) {
    const uid = pendingDoc.id;
    const data = pendingDoc.data();
    const updates = {};
    let stillPending = false;

    if (data.crossChannelSweep?.pending) {
      if (!staleRefsByUid) {
        // The shared scan itself failed above - nothing to retry against
        // this pass, leave the existing pending record untouched.
        stillPending = true;
      } else {
        try {
          const staleRefs = staleRefsByUid.get(uid) || [];
          if (staleRefs.length > 0) await deleteInChunks(staleRefs);
          updates.crossChannelSweep = admin.firestore.FieldValue.delete();
          console.log(`Finished cross-channel sweep for ${uid} (${staleRefs.length} refs).`);
        } catch (e) {
          console.error(`Cross-channel sweep still failing for ${uid}:`, e);
          updates.crossChannelSweep = {
            pending: true,
            lastError: e instanceof Error ? e.message : String(e),
            attempts: (data.crossChannelSweep.attempts || 0) + 1,
          };
          stillPending = true;
        }
      }
    }

    if (data.usernameCleanup?.pending) {
      try {
        await db.doc(`usernames/${data.usernameCleanup.twitchUsername}`).delete();
        updates.usernameCleanup = admin.firestore.FieldValue.delete();
        console.log(`Finished username-mapping cleanup for ${uid} (${data.usernameCleanup.twitchUsername}).`);
      } catch (e) {
        console.error(`Username cleanup still failing for ${uid}:`, e);
        updates.usernameCleanup = {
          ...data.usernameCleanup,
          lastError: e instanceof Error ? e.message : String(e),
          attempts: (data.usernameCleanup.attempts || 0) + 1,
        };
        stillPending = true;
      }
    }

    if (stillPending) {
      // A shared-scan failure with nothing else to record leaves `updates`
      // empty - skip the no-op write rather than bumping updateTime for
      // nothing.
      if (Object.keys(updates).length > 0) await pendingDoc.ref.update(updates);
    } else {
      // Both sweeps (whichever applied) succeeded - nothing left to track.
      await pendingDoc.ref.delete();
    }
  }

  console.log('Retry pass complete.');
}

retryAccountCleanup().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
