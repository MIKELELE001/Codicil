# UI brief for Grok Build — Scopeguard (working title)

Product: a workspace where a freelancer and an AI agent keep a client agreement, scope and money in sync.
Hook: "Stop doing free work." A client message becomes a priced, evidence-backed change order the freelancer approves.

## Read first (in this order)
1. `AGENTS.md`, `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/shadcn-ui/SKILL.md`, `.agents/skills/actions/SKILL.md`
2. Any extra UI skills installed in `.claude/skills/` or `.grok/skills/` (frontend-design, shadcn, better-interface, interaction-design, adapt, accessibility). Read them before writing code.

## Hard rules
- **No business logic in the UI.** Every read/write goes through the existing actions in `actions/`. Never compute totals, prices, versions or invoice amounts in React. Format only.
- Money arrives as **USD cents**. One shared `formatUsd(cents)` helper, tabular numbers, never floats.
- Do not edit `server/db/*`, `server/lib/*` or `actions/*` without asking. If an action is missing something, say what and stop.
- Every screen needs a real empty state, loading state and error state. Keyboard focus visible. Mobile-first for the public client page.
- Distinctive, not templated. One memorable element (the change review). Everything else quiet.

## Screens and the actions behind them
1. **Dashboard** `/home` — `list-projects`: outstanding $, pending changes, "$ caught from scope creep" (`caughtCents`), project list with status + version + pending badge. Button **Load demo workspace** → `load-demo-workspace`.
2. **Project** `/projects/:id` with tabs:
   - **Scope & Proposal** — `get-proposal` (sections, price table, payment schedule), edit a section → `save-proposal-section` with `fromUser: true`; edit a scope line → `save-scope-item`. Header shows current version, agreed total, status.
   - **Changes** (the star) — `list-change-orders` list; open one → `get-change-order`.
     **Change review component**: before/after lines (red/green), sticky delta pill ("+$420 · +4 days"), the client's quoted sentence as evidence, classification chip (included / unclear / additional), drafted client reply with Copy button. Actions: **Approve** → `approve-change-order`, **Reject** → `reject-change-order`, **Send to client** → `share-change-order` (returns `/c/<token>`; show full URL + copy). Show a pending-change banner on the project until resolved.
   - **Invoices** — `list-invoices`, `create-invoices` (when none exist), `mark-invoice-paid` (optional tx hash field). Show paid / outstanding.
   - **Activity** — `list-activity`: scope versions (v1, v2, v3…), `signatures` (who accepted what, when, fingerprint) and audit events.
3. **Rate card** `/rates` — `list-rate-items`, `save-rate-item` (name, unit, USD rate).
4. **Living agreement page** `/a/:token` (PRIMARY client page; no login, mobile first, read-only except the sign/accept controls) — `GET /api/agreement/:token`, `POST /api/agreement/:token`.
   - `state: "awaiting_acceptance"`: show the proposal (title, client, prose `sections`, price table from `lines`, `schedule`, `payment` details: currency/network/reference/terms, included/excluded, revisions) and a **Sign** box: a **consent checkbox** (use the text in `consent.agreement`; the POST is refused without `consent: true`), then one text field "Type any name you're comfortable with (a first name, handle or alias)", optional note, Accept button → `POST {type:"accept_agreement", signerName, note, consent: true}`. Show the privacy note from `privacyNote`. No email, ID or address fields. Ever.
   - `state: "active"`: show the current agreed scope and total, the `versions` history, the `signatures` list (name, date, version, short fingerprint) and, if `pendingChange` exists, a before/after review with Accept (needs typed name) and Decline → `POST {type:"respond_change", decision, signerName, note, consent: true}` (consent text in `consent.change`; declining needs no name or consent).
   - Wording: use `signatureLabel` ("Accepted electronically (typed name)") and show `identityNote` ("Signer identity is not verified…") next to signatures. Never write "verified", "identity confirmed", "court-proof" or "legally binding signature". Show the fingerprint (it is the same before and after signing) as "Agreement fingerprint" with a short tooltip: a code that changes if the agreement text changes.
   - The freelancer side: a **Share agreement** button (`publish-agreement`) showing the full URL with Copy, and a **Payment details** form (`set-payment-details`: deposit %, currency, network, reference, terms).
   - `state` can also be `"expired"` (show "This proposal has expired, ask for a fresh link", no sign box). If `expiresAt` is set, show "Open until <date>".
   - Show a revision counter from `revisionsUsed` / `revisionsIncluded` (e.g. "2 of 2 revisions used"; warn when over).
   - When `state` is `active`, add a **Print receipt** link to `/api/agreement/:token/receipt` (printable "Acceptance and evidence record": parties, scope, invoices with payment references, every client request with the quoted words, acceptances with the consent text shown, fingerprint. It doubles as a compliance pack for fintech account reviews. Opens in a new tab; Print > Save as PDF makes the file).
   - Show `totalExtraDays` ("+3 days from approved changes") and the payer name / payment rail inside the payment block (`payment.payerName`, `payment.rail`, `payment.dueDays`).
   - Freelancer side: Payment details form also takes `payerName`, `paymentRail`, `paymentDueDays` (`set-payment-details`). Invoices list shows due date, an **Overdue** badge and `daysOverdue` (`list-invoices`); the dashboard shows `overdueCents` (`list-projects`). Reminders are drafted by the agent for the freelancer to send; the UI never sends anything.
   - Share dialog also has an optional "Valid for N days" (`publish-agreement` `validDays`), and a **Log revision** button (`log-revision`) on the project.
   - Add `/a` prefix handling to `PUBLIC_PATHS` in `app/root.tsx`. Server side is done.
4b. **Older single-change page** `/c/:token` (no login, mobile first) — `GET /api/client/:token` for data; `POST /api/client/:token` with `{decision: "accept"|"decline", comment}`. Show project, what changed, before/after, new total, extra days. Big Accept / Decline. After responding, show a confirmation. This route must be public: add `/c` handling to `PUBLIC_PATHS` in `app/root.tsx` (prefix match, not exact) — server side is already done in `server/plugins/auth.ts`.
5. **Agent side panel** — use the framework's agent sidebar so the agent sees the open project. Chat is secondary; the workspace is the product.

Also: set `app.homePath` and the sidebar (Dashboard, Projects, Rate card) per the "Building a domain app" section of `AGENTS.md`. Command bar (Cmd/Ctrl+K) that calls the same actions is a nice extra, only after the screens above work.

## Done means
`pnpm typecheck` clean, `pnpm agent-native:doctor` clean, and this flow works by clicking: load demo → project → paste client message in agent panel → change appears → Approve → v2 + invoice balance updated → Send to client → open `/c/<token>` on a phone-size window → Accept → project updates.
