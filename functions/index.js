// Discord signup notifications are sent by the Next.js API route
// (src/app/api/notify-signup/route.js), triggered from the login flow.
// This Cloud Function used to send a duplicate notification on every
// `users/{userId}` document creation and was removed to avoid double-posting.
