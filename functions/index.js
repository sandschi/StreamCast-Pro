// Discord signup notifications are sent by the Next.js API route
// (src/app/api/notify-signup/route.js), triggered from the login flow.
// This Cloud Function used to send a duplicate notification on every
// `users/{userId}` document creation and was removed to avoid double-posting.

const { onSchedule } = require('firebase-functions/v2/scheduler');
const admin = require('firebase-admin');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Karaoke request timeouts (see #27): 5 min for a targeted request to be
// answered before it opens up to every online singer as a public request, 10
// min for a public request to be claimed before it expires. Deliberately a
// real scheduled function rather than a client-driven timer (the pattern
// active_message expiry uses) - a request needs to transition on schedule
// even if nobody's dashboard happens to be open to notice.
exports.expireKaraokeRequests = onSchedule('every 1 minutes', async () => {
    const now = admin.firestore.Timestamp.now();
    const batch = db.batch();
    let writes = 0;

    const timedOutPending = await db.collectionGroup('karaoke_requests')
        .where('status', '==', 'pending')
        .where('respondBy', '<=', now)
        .get();
    timedOutPending.forEach(docSnap => {
        batch.update(docSnap.ref, {
            status: 'public', targetSingerUid: null, respondBy: null,
            publicExpireBy: admin.firestore.Timestamp.fromMillis(now.toMillis() + 10 * 60 * 1000),
        });
        writes++;
    });

    const expiredPublic = await db.collectionGroup('karaoke_requests')
        .where('status', '==', 'public')
        .where('publicExpireBy', '<=', now)
        .get();
    expiredPublic.forEach(docSnap => {
        batch.update(docSnap.ref, { status: 'expired' });
        writes++;
    });

    if (writes > 0) await batch.commit();
});
