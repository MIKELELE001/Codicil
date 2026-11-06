# Codicil

A codicil amends a will without rewriting it. Codicil does the same for client
agreements: every change is a priced, approved, recorded amendment.

**The problem:** clients keep adding "small" requests after the price is agreed,
and freelancers end up doing the work for free.

## What it does

- An agent compares a pasted client message with the agreed scope and classifies it
  as **included**, **unclear** or **additional**, quoting the client's exact words.
- Additional work is priced from the freelancer's own rate card. The AI never
  invents a price; all totals are computed by code, in integer cents.
- The freelancer approves the change. One all-or-nothing transaction creates a new
  agreement version and adjusts the invoices. Paid invoices are never rewritten.
  Approving twice is refused, so a retry cannot apply a change twice.
- One private link per project shows the client the current agreement, payment
  details and any pending change. The client accepts by typing any name they choose.
  No email or ID is collected.
- A printable evidence record lists the agreement, invoices, client requests and
  acceptances, with a fingerprint that changes if the terms are altered.
- Extras: revision counter, proposal expiry, invoice due dates with overdue
  tracking, payer name and payment rail on the agreement (for crypto and
  cross-border payments).

## Honest limits

Acceptance is recorded as "accepted electronically (typed name)". The signer's
identity is not verified, and this is not a certified e-signature. Intake is
paste-in only (no WhatsApp or email integration yet). No payment processing.

## How the agent and the app share one set of actions

Every read and write is an Agent-Native `defineAction`. The agent calls them, and
so will every button in the UI. The agent can only *propose* a change; applying it
requires an explicit approval. Rules such as "price only from the rate card" are
enforced in code, not just in the prompt.

## Run it locally

```
pnpm install --ignore-scripts
pnpm dev
```

Add your own AI provider key in Settings (Anthropic, Google Gemini and Groq work),
then say "Load the demo workspace" in the chat to see the Acme Studio example.

## What was built for this hackathon

Started from the Agent-Native "chat" template (scaffold, auth and chat shell).
Everything specific to Codicil was written during the hackathon window: the
database schema and migrations, the rate card, scope versions, the change-order
engine, invoice adjustments, the agreement link and acceptance records, the
evidence page, and the agent's instructions.

Built for the Builder.io Agent-Native Hackathon.
