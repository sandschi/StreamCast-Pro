# Handover — StreamCast Pro legal docs

**Date**: 2026-09-06
**Produced in**: Claude chat, from a live scan of https://betaoverlay.sandschi.xyz
**Continues in**: Claude Code, against the StreamCast Pro repo

---

## What already exists

Two drafts, both complete enough to iterate on:

- `TERMS-OF-SERVICE-pervtown-2026-09-06.md` — 14 sections, 23 `[VERIFY]` markers
- `PRIVACY-POLICY-pervtown-2026-09-06.md` — 14 sections, 26 `[VERIFY]` markers

Put both in the repo (suggested: `docs/legal/`) before starting the Claude Code session, so they can be read and edited in place rather than re-pasted.

**Do not re-run the terms-of-service generator.** Its two steps — scan the site, draft the document — are done. A second run would re-scan the same beta build and produce a generic draft that undoes the jurisdiction work described below.

---

## Decisions already made — do not silently reverse these

These deviate from the generator's default template on purpose. If a later pass wants to change one, that should be a conscious decision, not a regression.

| Decision | Reason |
|---|---|
| No arbitration clause, no class action waiver | Largely unenforceable against EU consumers (KSchG §6(2)(7), Unfair Terms Directive) |
| No link to the EU ODR platform | It ceased operation on 20 July 2025; most templates still link it |
| Liability for intent, gross negligence, personal injury and PHG expressly preserved | Cannot be excluded under Austrian law regardless of wording |
| Austrian law + Vienna venue for business users; statutory venue kept for consumers | Rome I Art. 6 |
| CCPA section included but flagged as almost certainly inapplicable | Thresholds not met; kept as goodwill, not presented as obligation |
| Viewer chat framed as processor role, not controller | The streamer decides what airs; that is the controlling act |
| Art. 14 (not Art. 13) applied to viewer data | Data comes from the Twitch API, not from the viewer |
| Overlay URLs treated as credentials throughout | They carry access tokens; this is a real security property of the product |

---

## Open items, split by who can answer them

### A. Answerable from the codebase — do these in Claude Code

Each of these is currently a `[VERIFY]` blank that the repo already knows the answer to:

1. **Which Twitch OAuth scopes are requested?** Determines whether the email address is collected at all (Privacy §3) and what the token can do.
2. **Are OAuth tokens encrypted at rest?** (Privacy §12.2) — if not, that is a fix, not a documentation task.
3. **Which badges / role metadata are stored per chat message?** (Privacy §5.2)
4. **Actual sub-processors**: hosting, database, email delivery, error monitoring, analytics — names and regions. (Privacy §8.3, §8.4, transfers §9)
5. **Which analytics tool is behind the cookie banner**, and what it sets. (Privacy §7.3, §7.4 — the cookie table needs real cookie names and lifetimes)
6. **Current retention behaviour**: is anything deleted today, or does message history grow without bound? (Privacy §11)
7. **Backup cycle length.** (Privacy §11)
8. **Who has production data access.** (Privacy §12.3 — if it is one person, the honest answer is fine)

### B. Needs a human or legal decision — cannot be resolved from code

1. **Legal entity behind "Pervtown"** — registered company, e.U., or you personally. Changes liability exposure and the ECG §5 disclosure block. Blocks publication of both documents.
2. **Full postal address** — legally required, PO box insufficient.
3. **Company register number / VAT ID**, if registered.
4. **Retention periods as a policy choice** — see below, this is the big one.
5. **Minimum age**: 18 as drafted, vs. Twitch's own 13. Lowering it brings Austrian contractual-capacity problems for minors.
6. **Post-beta pricing model** — Terms §4 is written to prevent a silent conversion complaint; real terms needed before any charge.
7. **Whether KaraFun's terms permit displaying queue data in a third-party overlay.**
8. **Lawyer review of the liability cap** (Terms §9.4) — EUR 100 may be reduced under KSchG §6.

---

## Code work that follows

Four tasks, in the order I would do them:

**1. Retention and automatic deletion.**
The product advertises that every message is kept and searchable. That is open-ended storage under GDPR Art. 5(1)(e), and "as long as necessary" is not an answer a regulator accepts. Decide a concrete window (a 90-day rolling window is a reasonable default for a re-air feature), implement scheduled deletion, then write the real number into Privacy §11.
*Acceptance*: a job that provably deletes messages past the window, including from search indices, plus the number in the doc.

**2. Honour Twitch deletion events.**
Handle `CLEARMSG` and `CLEARCHAT` so that a message deleted or a user timed out on Twitch is removed from StreamCast history too. This closes an Art. 17 gap and is a genuine trust signal for viewers.
*Acceptance*: deleting a message on Twitch removes it from history, from search, and from the re-air queue. Then remove the `[VERIFY]` at Privacy §5.7 and state the behaviour affirmatively.

**3. Evaluate replacing the analytics tool.**
A cookieless, EU-hosted analytics tool would let you delete most of Privacy §7 and remove the consent banner entirely. For a product whose pitch is "small tools for small streams," a consent dialog is friction that may not be earning its place. This is a judgement call, not an obligation — the current banner with a working Decline is compliant.

**4. Art. 14 disclosure reaching viewers.**
A privacy page nobody in chat will visit is thin cover. Practical options: require streamers to disclose StreamCast in a channel panel (enforce in the Terms), a chat command, or a persistent marker on the overlay. Pick one and implement it.

Separately, once the entity question in B.1 is settled: an Art. 28 DPA template for business streamers. Any streamer running their channel commercially is in breach without one.

---

## Suggested opening prompt for Claude Code

> Read `docs/legal/TERMS-OF-SERVICE-pervtown-2026-09-06.md`, `docs/legal/PRIVACY-POLICY-pervtown-2026-09-06.md` and `docs/legal/HANDOVER-legal-docs-2026-09-06.md`.
>
> Start with section A of the handover: work through the codebase and answer each of those eight questions with a file reference. Do not edit the legal documents yet — report findings first, then we decide together which `[VERIFY]` blanks to fill and which reveal a fix rather than a documentation gap.
>
> Do not re-run the terms-of-service generator skill, and do not reintroduce the clauses listed under "decisions already made."

Holding the edits back on the first pass matters: several of those questions will turn out to describe a problem rather than a fact, and you want to see that before it gets written down as settled behaviour.

---

*Written in English to match the repo. Say the word if you would rather have it in German.*
