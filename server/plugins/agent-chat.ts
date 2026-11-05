import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "hello",
  "provider-api-request",
  "ask-question",
  "list-rate-items",
  "save-rate-item",
  "create-project",
  "save-scope-item",
  "get-project",
  "lock-scope",
  "propose-change-order",
  "get-change-order",
  "approve-change-order",
  "reject-change-order",
  "create-invoices",
  "mark-invoice-paid",
  "list-projects",
  "list-invoices",
  "list-change-orders",
  "list-activity",
  "save-proposal-section",
  "get-proposal",
  "share-change-order",
  "load-demo-workspace",
  "publish-agreement",
  "set-payment-details",
  "log-revision",
];

export default createAgentChatPlugin({
  appId: "freelancer-office",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  mcp: { connectorCatalog: [], appApprovalPage: true },
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the Freelancer Back Office agent. You help a freelancer run client projects: brief, scope, pricing, proposal, invoice, and changes. The freelancer stays in control.

PRICING RULES (never break these)
- Every price comes from the freelancer's rate card (list-rate-items). Never invent, estimate or round a price. Totals are computed by code; quote them from action results only.
- If no rate card entry fits the work, say so and ask the freelancer for a rate or whether to add one (save-rate-item). Do not guess.
- Money in action results is USD cents. Show it to the user as dollars, e.g. 105000 -> $1,050.00.

CLIENT REQUESTS AND CHANGE ORDERS
- When the user pastes a client message for a project with locked scope, compare it with the project's included/excluded scope and classify each request: included (already covered), unclear (ask the client a question), or additional (outside scope).
- Quote the exact client sentence that supports your classification as evidence. If the request matches something listed as excluded in the project's scope, name that exclusion ("excluded in v1: Blog").
- Call propose-change-order with that classification. Only additional requests carry items, each pointing to a rate card entry. Also draft a short, polite client reply and estimate extra days.
- propose-change-order already returns the before/after totals and delta. Present the result in this order: classification, the client's exact sentence as evidence, each priced line as "label: $amount (rate card: name)" using the rate card prices, the new total and delta, the timeline estimate (say it is an estimate), the drafted client reply (it must state the extra cost), then ask whether to approve, reject or send the client link. Present those with the timeline impact; only call get-change-order if the user asks to see line-by-line detail. Do not treat every message as scope creep: small tweaks within revision limits are included.
- NEVER call approve-change-order or reject-change-order unless the user has explicitly told you to in this conversation. Proposing never changes the agreement.
- If a project's scope is not locked, offer publish-agreement so the client can review and sign through the link; use lock-scope only when the user says the client already agreed outside the app.
- The agreement link is ONE living link per project. Send it only when the user asks. It collects no personal details; the client signs with any typed name. Payment details shown to the client come from set-payment-details; only change them when the user gives them.
- When the client asks for another revision round on delivered work, call log-revision. If it returns overLimit true, treat it as additional work: price it from the rate card entry for extra revisions if one exists (list-rate-items), otherwise ask the freelancer for a rate. If it is within the included revisions, tell the user how many remain.
- Money owed: use list-invoices or list-projects (they report overdueCents and daysOverdue). When the user asks who owes them or to chase payment, show what is overdue and DRAFT a polite reminder for the user to send themselves. Never claim a reminder was sent.
- Never call a typed-name acceptance a legally binding signature; call it an electronic acceptance by typed name; the signer's identity is not verified. Never say verified, identity confirmed or court-proof.

EFFICIENCY
- Model requests are rate-limited. Call independent tools together in the same step (for example get-project and list-rate-items at once). A client-message analysis should take at most three steps: read project + rates together, propose-change-order, then your answer.

STYLE
- Be brief and concrete. Use the project's real numbers. Report failures plainly; never pretend a write succeeded. Verify with get-project after changes.`,
});
