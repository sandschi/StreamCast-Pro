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

    const [timedOutPending, expiredPublic] = await Promise.all([
        db.collectionGroup('karaoke_requests').where('status', '==', 'pending').where('respondBy', '<=', now).get(),
        db.collectionGroup('karaoke_requests').where('status', '==', 'public').where('publicExpireBy', '<=', now).get(),
    ]);

    // Each transition runs in its own transaction, re-reading the document
    // and re-checking its status/deadline immediately before writing. The
    // query snapshots above can be seconds stale by the time this commits -
    // a concurrent client write (accept/decline/claim) landing in that
    // window must win over this scheduled sweep, not get silently
    // overwritten by a shared unconditional batch. Per-doc transactions
    // instead of one big batch also sidesteps Firestore's 500-write batch
    // cap, since there's no shared batch left to overflow.
    const transitions = [
        ...timedOutPending.docs.map(docSnap => db.runTransaction(async (tx) => {
            const fresh = await tx.get(docSnap.ref);
            const data = fresh.data();
            if (!fresh.exists || data.status !== 'pending' || !(data.respondBy?.toMillis() <= now.toMillis())) return;
            tx.update(docSnap.ref, {
                status: 'public', targetSingerUid: null, respondBy: null,
                publicExpireBy: admin.firestore.Timestamp.fromMillis(now.toMillis() + 10 * 60 * 1000),
            });
        })),
        ...expiredPublic.docs.map(docSnap => db.runTransaction(async (tx) => {
            const fresh = await tx.get(docSnap.ref);
            const data = fresh.data();
            if (!fresh.exists || data.status !== 'public' || !(data.publicExpireBy?.toMillis() <= now.toMillis())) return;
            tx.update(docSnap.ref, { status: 'expired' });
        })),
    ];

    await Promise.all(transitions);
});
