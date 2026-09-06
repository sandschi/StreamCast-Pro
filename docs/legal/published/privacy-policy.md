# StreamCast Pro Privacy Policy

**Last Updated**: 2026-09-06
**Effective Date**: 2026-09-06

---

## 1. Who We Are and How to Reach Us

> **Plain English Summary**: We're Pervtown, the people who run StreamCast Pro. We decide what happens to the data described here, which makes us legally responsible for it. If you want something changed or deleted, email us and a human will read it.

**Controller** (GDPR Art. 4(7)): Pervtown, Vienna, Austria.

- **Privacy requests and general support**: support@sandschi.xyz
- **Data Protection Officer**: No formal DPO is required under GDPR Art. 37 at our current scale. Responsible contact person: Sandschi, reachable at support@sandschi.xyz.

---

## 2. Scope

> **Plain English Summary**: This covers the StreamCast Pro website, the dashboard, and the overlay. It doesn't cover Twitch, KaraFun, OBS, or the channels of streamers who use our tool — those have their own policies.

2.1 This Policy applies to https://overlay.sandschi.xyz, the StreamCast Pro dashboard, and the overlay rendering service.

2.2 It does **not** apply to Twitch, KaraFun, OBS, Discord, or any other third-party service, nor to what an individual streamer does on their own channel.

2.3 Two groups of people are covered, and their situations differ substantially:

- **Streamers and moderators** — you hold an account, you agreed to our Terms, and we are the controller for your data.
- **Viewers** — you wrote a message in someone's Twitch chat and it passed through our system. You never agreed to anything with us. Section 5 is written for you.

---

## 3. What We Collect from Streamers and Moderators

> **Plain English Summary**: When you connect through Twitch we get your Twitch identity and a token that lets us read your chat. We store your overlay settings, your moderator list, and technical logs. We never see or store your Twitch password or email address.

| Category | Specific data | Where it comes from |
|---|---|---|
| Twitch identity | Twitch user ID, login name, display name, profile image, broadcaster type | Twitch OAuth |
| Email address | Not collected. We only request the `chat:read`, `chat:edit`, `channel:read:redemptions`, and `moderator:read:chatters` scopes — not `user:read:email`. | N/A |
| Access credentials | OAuth access token | Twitch OAuth |
| Application data | Anything you submit when applying for access, plus our review notes and decision | You |
| Channel configuration | Overlay style, pixel positions, per-scene layouts, auto-approve state, queue settings | You |
| Moderator relationships | Which Twitch accounts you invited, their role, when access was granted or revoked | You |
| Chat and queue activity | Messages you approved, rejected, or re-aired, with timestamps and the acting account | Your use of the dashboard |
| Technical data | IP address, browser and OS, timestamps, error and security logs, overlay connection events | Automatically |
| Website analytics | Pages viewed, referrer, approximate region, session data | Only if you accept the cookie banner |

We do **not** collect or store passwords. Authentication runs entirely through Twitch OAuth.

---

## 4. Why We Process It, and on What Legal Basis

> **Plain English Summary**: Most of it we process because you asked us to run an overlay for you — that's the contract. Security logging we do because we have a legitimate interest in not being abused. Analytics only happens if you say yes, and you can take that back any time.

| Purpose | Data used | Legal basis (GDPR Art. 6) |
|---|---|---|
| Authenticating you and running your account | Twitch identity, tokens | Art. 6(1)(b) — contract |
| Rendering your overlay and running the approval flow | Configuration, chat messages, queue data | Art. 6(1)(b) — contract |
| Reviewing access applications by hand | Application data, Twitch identity | Art. 6(1)(b) — pre-contractual steps |
| Message history, search, and re-air | Chat messages and metadata | Art. 6(1)(b) — contract (this is an advertised feature) |
| Security, abuse prevention, rate limiting, debugging | Technical logs, IP | Art. 6(1)(f) — legitimate interest in a functioning, non-abused service |
| Website analytics | Usage data, cookies | Art. 6(1)(a) — consent |
| Complying with legal obligations and responding to lawful requests | As required | Art. 6(1)(c) |

Where we rely on legitimate interests, we have weighed those interests against your rights and concluded processing is proportionate. You may object under Art. 21 — see section 10.

Where we rely on consent, you may withdraw it at any time via "Cookie preferences" in the footer, without affecting processing that already happened.

---

## 5. Viewer Chat Messages — Read This If You Are a Viewer

> **Plain English Summary**: If you typed in a Twitch chat that uses StreamCast Pro, your username and message passed through our servers so the streamer could decide whether to put it on screen. We didn't collect it from you, we got it from Twitch, and we only act on the streamer's instructions. The decision to broadcast your message was the streamer's, not ours — but you can still contact us and we'll help.

5.1 **What happens.** Messages in a connected Twitch channel are read via the Twitch API, stored so the streamer can review and search them, and rendered on the overlay only after a streamer or moderator manually approves them. Nothing airs automatically unless the streamer has enabled auto-approve.

5.2 **What we hold about you.** Your Twitch username and display name, your message text and emotes, the timestamp, and whether the message was approved, rejected, or re-aired. We do not store your role or badges (moderator, subscriber, etc.) alongside a message.

5.3 **Our role.** For viewer messages we act largely as a **processor** on the streamer's instructions (GDPR Art. 28). No chat message is captured until a streamer has connected their Twitch account and been manually approved for access, and the service only ever connects to a channel the account-holder controls or has explicitly invited a moderator into. The streamer determines which channel is connected and which messages are broadcast; they are the controller for that decision. We do not use viewer messages for our own purposes, do not profile viewers, and do not sell or share this data.

5.4 **Transparency.** Because we obtained your data from Twitch rather than from you directly, GDPR Art. 14 applies. This section is that notice. Streamers using StreamCast Pro are contractually required to disclose that use to their viewers — typically via a Twitch channel panel linking to this page — within 7 days of their access being approved.

5.5 **Sensitive content.** Chat messages can incidentally contain special category data under Art. 9 — health, religion, sexual orientation, political views — because people type whatever they type. We do not seek out such data and do not process it deliberately.

5.6 **Your rights.** You have the same rights listed in section 10. Write to support@sandschi.xyz with the channel name and your Twitch username. Where we act as processor, we will forward your request to the relevant streamer and assist them in answering it.

5.7 **Deletion on Twitch.** Deleting a message on Twitch, or timing out/banning the person who sent it, removes it from the streamer's StreamCast history, from the re-air queue, and from the live overlay if it's currently showing. A full chat clear on Twitch (e.g. a moderator running `/clear`) does not by itself wipe StreamCast history — only Twitch's own per-message and per-user deletion signals do.

---

## 6. KaraFun Queue Data

> **Plain English Summary**: If you use the KaraFun integration, we pull in what's queued and who's singing next so it can go on the overlay. Names in that queue are personal data too.

6.1 We process song titles, queue position, and performer names or handles from the KaraFun queue you connect, solely to display them on your overlay.

6.2 Performer names are personal data where they identify a person. The same rights and retention rules apply.

6.3 Your use of KaraFun is governed by KaraFun's own privacy policy. We have no control over their processing.

---

## 7. Cookies and Analytics

> **Plain English Summary**: Necessary cookies keep you logged in and can't be switched off. Analytics only runs if you clicked Accept. Declining costs you nothing — the site works exactly the same.

7.1 **Strictly necessary cookies** are set without consent, as permitted by TKG 2021 §165(3): session and authentication cookies, security tokens, and your cookie preference itself.

7.2 **Analytics cookies** are set only after you accept in the banner. The banner offers a genuine "Decline" and declining leaves the site fully functional.

7.3 **Analytics provider**: PostHog, hosted on PostHog's EU cluster. PostHog is only initialized in the browser after you accept the cookie banner. Client IP addresses are discarded and not stored with events. Event data is retained for up to 1 year.

7.4 **Cookie table**:

| Name | Purpose | Provider | Type | Lifetime |
|---|---|---|---|---|
| `sc-cookie-consent` | Stores your accept/decline choice for analytics | StreamCast Pro (first-party) | `localStorage`, not a cookie | Until cleared by you |
| PostHog analytics identifiers | Distinct visitor/user identification, session tracking | PostHog (EU) | Cookie + `localStorage` | Up to ~1 year; only set after consent |
| Firebase Auth session storage | Keeps you signed in to the dashboard | Firebase (Google) | `localStorage`/`IndexedDB`, not a cookie | Until you sign out or the session expires |

7.5 You can change your choice at any time via "Cookie preferences" in the site footer, or clear cookies in your browser.

7.6 We do not use advertising cookies, cross-site tracking pixels, or fingerprinting.

---

## 8. Who We Share Data With

> **Plain English Summary**: A short list: the platforms the product plugs into, and the companies that host it. Nobody buys data from us, because we don't sell it.

8.1 **Twitch** (Twitch Interactive, Inc., a subsidiary of Amazon) — unavoidable; the product reads chat through the Twitch API under your OAuth grant.

8.2 **KaraFun** — only if you enable the queue integration.

8.3 **Hosting and infrastructure providers**: Firebase / Google Cloud Platform (database and authentication) and Vercel (application hosting).

8.4 **Discord** — receives limited signup information (Twitch username, display name, avatar, account ID, signup timestamp) to notify us of new broadcaster applications. We do not use a separate email-delivery or error-monitoring service.

8.5 **Legal disclosure.** We may disclose data where legally required, to respond to a lawful authority request, or to establish, exercise, or defend legal claims. We will notify you unless legally prohibited.

8.6 **Business transfer.** If the service is sold or transferred, data may transfer with it, subject to this Policy and with notice to you.

8.7 **We do not sell personal data** and do not share it for cross-context behavioural advertising.

---

## 9. International Transfers

> **Plain English Summary**: Twitch is American, so some data inevitably crosses the Atlantic. That transfer needs a legal safeguard, and we have to tell you which one we rely on.

9.1 Twitch processes data in the United States. Other providers may also process outside the EEA.

9.2 Google/Firebase and Vercel are both certified under the EU–US Data Privacy Framework; Vercel additionally relies on Standard Contractual Clauses. PostHog processes data exclusively in its EU region, so no international transfer occurs for that provider. Twitch's own transfer safeguard relies on its general representation that it takes appropriate measures to protect data processed internationally.

9.3 You may request more information about the safeguards in place by writing to support@sandschi.xyz.

---

## 10. Your Rights

> **Plain English Summary**: You can ask what we hold, get a copy, have it corrected or deleted, tell us to stop, or take it elsewhere. Delete your account yourself any time from the dashboard, or email us for anything else — we'll answer within a month. If we handle it badly, you can complain to the Austrian data protection authority, and that's free.

Under GDPR you have the right to:

- **Access** (Art. 15) — a copy of your data and information about how it is processed
- **Rectification** (Art. 16) — correction of inaccurate data
- **Erasure** (Art. 17) — deletion, subject to legal retention obligations
- **Restriction** (Art. 18) — processing paused while a dispute is resolved
- **Portability** (Art. 20) — your data in a structured, machine-readable format
- **Objection** (Art. 21) — to processing based on legitimate interests
- **Withdraw consent** (Art. 7(3)) — at any time, without affecting prior processing
- **Not be subject to automated decision-making** (Art. 22) — our access review is done by hand, not by algorithm

**How to exercise them**: email support@sandschi.xyz. We respond within one month, extendable by two further months for complex requests. Exercising these rights is free unless a request is manifestly unfounded or excessive.

**Deleting your account**: a "Delete My Account" control in the dashboard (Settings → Dashboard) lets you erase your account yourself, with a typed confirmation step and a clear explanation of what's removed. On confirmation, your account, settings, chat history, and KaraFun data are deleted immediately; your stored Twitch access token is discarded and Twitch is notified to revoke this app's authorization; and any copy of your name, photo, or role left on other broadcasters' channels is cleaned up too. This is irreversible — there is no backup to restore from and no undo window.

**Complaints**: Österreichische Datenschutzbehörde, Barichgasse 40–42, 1030 Vienna, dsb@dsb.gv.at, dsb.gv.at — or the supervisory authority where you live or work. You can also go to court.

**California residents**: you additionally have the right to know, delete, correct, opt out of sale or sharing, and limit the use of sensitive personal information, and not to be discriminated against for exercising these rights. We do not sell or share personal information, so no opt-out link is provided.

---

## 11. How Long We Keep Things

> **Plain English Summary**: Most things have a clear, short retention window, and several are deleted automatically without you needing to ask.

| Data | Retention |
|---|---|
| Account and configuration data | Deleted immediately, self-service, via the "Delete My Account" control in the dashboard. |
| Chat message history | 30 days, rolling. Deleted automatically every night. |
| KaraFun queue and song-request data | 30 days, rolling. Deleted automatically every night. |
| OAuth tokens | Until you revoke access or delete your account. |
| Technical and security logs | Governed by our infrastructure providers' own default retention periods. |
| Analytics data | Up to 1 year. |

We do not currently keep backups of our database, so deleted data does not persist anywhere past the periods above.

---

## 12. Security

> **Plain English Summary**: OAuth means we never touch your password. Roles are enforced on the server, not just hidden in the interface. Your overlay URL is effectively a password — don't show it on stream. Your Twitch token gets extra protection beyond that.

12.1 Authentication is OAuth-only; no passwords are stored. Role gating is enforced server-side, not merely in the client interface.

12.2 Data is encrypted in transit via TLS. Your Twitch OAuth token is additionally encrypted at the application layer before it ever reaches our database, using a key that exists only on our server and is never sent to any browser.

12.3 Access to production data is limited: within the application, one administrative account has full access, enforced by server-side security rules; every other signed-in user is restricted to their own channel's data, or a channel that has explicitly invited them as a moderator.

12.4 **Overlay URLs contain access tokens.** Anyone holding one can push content to your stream. Do not display them on stream or share them publicly. We may rotate a URL we believe is exposed.

12.5 No system is perfectly secure. In the event of a personal data breach we will notify the Datenschutzbehörde within 72 hours where required under Art. 33, and affected individuals without undue delay where Art. 34 applies.

---

## 13. Children

> **Plain English Summary**: Accounts require you to be 16, or 13 with a guardian's consent. Viewers' ages we can't check — we only ever see what Twitch passes along.

13.1 StreamCast Pro accounts require you to be at least 16. If you are between 13 and 16, an account may only be created with a parent or legal guardian's consent, given directly to us alongside acceptance of the Terms.

13.2 We cannot verify the age of viewers whose chat messages pass through the service; Twitch's own age requirements apply.

13.3 In Austria, consent for information society services is valid from age 14 under national law (DSG §4(4)); our account policy sets a stricter threshold as our own business choice.

13.4 If you believe a child's data has been collected inappropriately, contact support@sandschi.xyz and we will delete it.

---

## 14. Changes to This Policy

> **Plain English Summary**: We'll update this when the product changes. Anything significant gets 30 days' notice, not a quiet edit.

14.1 The current version is always at https://overlay.sandschi.xyz/privacy with a "Last Updated" date.

14.2 For material changes — new data categories, new purposes, new recipients, or longer retention — we will give at least 30 days' notice by email and in the dashboard. Where a change requires consent, we will ask for it rather than assume it.

14.3 We will not apply a new purpose retroactively to data already collected without a valid basis for doing so.
