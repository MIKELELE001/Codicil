import { eq } from "drizzle-orm";
import { createError, defineEventHandler, getRouterParam, setResponseHeader } from "h3";

import { getDb, schema } from "../../../../db/index.js";
import { buildAgreement, IDENTITY_NOTE, projectByAgreementToken, SIGNATURE_LABEL } from "../../../../lib/agreement.js";

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const usd = (c: number) => `${c < 0 ? "-" : ""}$${(Math.abs(c) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const utc = (s: string | null) => (s ? new Date(s).toUTCString() : "");

/** Public, token-gated, printable acceptance and evidence record. Browser Print > Save as PDF. Also works as a payment-compliance pack. */
export default defineEventHandler(async (event) => {
  const p = await projectByAgreementToken(getRouterParam(event, "token") ?? "");
  if (!p || p.currentVersion === 0) throw createError({ statusCode: 404, statusMessage: "Not found" });
  const db = getDb();
  const { core, fingerprint } = await buildAgreement(p);
  const sigs = await db.select().from(schema.agreementAcceptances).where(eq(schema.agreementAcceptances.projectId, p.id)).orderBy(schema.agreementAcceptances.acceptedAt).limit(100);
  const invs = await db.select().from(schema.invoices).where(eq(schema.invoices.projectId, p.id)).orderBy(schema.invoices.createdAt).limit(100);
  const cos = await db.select().from(schema.changeOrders).where(eq(schema.changeOrders.projectId, p.id)).orderBy(schema.changeOrders.createdAt).limit(200);
  const pay = core.payment;

  const rows = core.lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="n">${esc(l.quantity)} ${esc(l.unit)}</td><td class="n">${usd(l.rateCents)}</td><td class="n">${usd(l.lineTotalCents)}</td></tr>`).join("");
  const sched = core.schedule.map((s) => `<tr><td>${esc(s.label)}</td><td class="n">${usd(s.amountCents)}</td></tr>`).join("");
  const invRows = invs.map((i) => `<tr><td>${esc(i.number)}</td><td>${esc(i.label)}</td><td class="n">${usd(i.amountCents)}</td><td>${esc(i.status)}${i.paidAt ? ` (${esc(utc(i.paidAt))})` : ""}</td><td>${esc(utc(i.dueAt))}</td><td class="mono">${esc(i.txHash)}</td></tr>`).join("");
  const coRows = cos.map((c) => `<tr><td>${esc(utc(c.createdAt))}</td><td>${esc(c.classification)} / ${esc(c.status)}</td><td>${esc(c.summary)}${c.evidence ? `<div class="q">Client wrote: &ldquo;${esc(c.evidence)}&rdquo;</div>` : ""}</td><td class="n">${c.classification === "additional" ? usd(c.deltaCents) : ""}${c.timelineDeltaDays ? `<div>${c.timelineDeltaDays > 0 ? "+" : ""}${c.timelineDeltaDays} days</div>` : ""}</td></tr>`).join("");
  const sigRows = sigs.map((s) => `<tr><td>${s.kind === "agreement" ? "Original agreement" : "Change order"} (v${s.version})</td><td>${esc(s.signerName)}</td><td>${esc(utc(s.acceptedAt))}</td><td class="mono">${esc(s.contentHash.slice(0, 16))}</td></tr>${s.consentText ? `<tr><td colspan="4" class="q">Consent shown: ${esc(s.consentText)}</td></tr>` : ""}`).join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Acceptance and evidence record: ${esc(core.title)}</title>
<style>
:root{color-scheme:light}body{font:15px/1.5 system-ui,sans-serif;color:#111;max-width:820px;margin:32px auto;padding:0 20px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;margin:28px 0 8px;color:#444}
table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
.n{text-align:right;font-variant-numeric:tabular-nums}.mono{font-family:ui-monospace,monospace;font-size:12px;word-break:break-all}.q{font-size:12px;color:#555}
.total td{font-weight:700;border-top:2px solid #111}.note{font-size:12px;color:#555;margin-top:24px}button{margin:16px 0;padding:8px 14px;font:inherit}@media print{button{display:none}}
</style></head><body>
<button onclick="window.print()">Print or save as PDF</button>
<h1>Acceptance and evidence record</h1>
<div>${esc(core.title)} &middot; current version v${core.version}</div>
<div class="q">${esc(SIGNATURE_LABEL)}. ${esc(IDENTITY_NOTE)}</div>
<h2>Parties and payment</h2>
<table><tbody>
<tr><td>Client</td><td>${esc(core.clientName)}</td></tr>
${pay.payerName ? `<tr><td>Paying entity</td><td>${esc(pay.payerName)}</td></tr>` : ""}
<tr><td>Currency / rail</td><td>${esc(pay.currency)}${pay.network ? ` on ${esc(pay.network)}` : ""}${pay.rail ? ` &middot; ${esc(pay.rail)}` : ""}</td></tr>
${pay.reference ? `<tr><td>Pay to</td><td class="mono">${esc(pay.reference)}</td></tr>` : ""}
<tr><td>Terms</td><td>${esc(pay.terms)} Invoices are due ${esc(pay.dueDays)} days after issue.</td></tr>
</tbody></table>
<h2>Agreed scope</h2>
<table><thead><tr><th>Item</th><th class="n">Quantity</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>${rows}<tr class="total"><td colspan="3">Total (${esc(pay.currency)})</td><td class="n">${usd(core.totalCents)}</td></tr></tbody></table>
${core.included ? `<h2>Included</h2><div>${esc(core.included)}</div>` : ""}${core.excluded ? `<h2>Excluded</h2><div>${esc(core.excluded)}</div>` : ""}
<div class="q">Revisions included: ${esc(core.revisionsIncluded)} (used: ${esc(p.revisionsUsed)})</div>
<h2>Payment schedule</h2><table><tbody>${sched}</tbody></table>
<h2>Invoices</h2><table><thead><tr><th>No.</th><th>For</th><th class="n">Amount</th><th>Status</th><th>Due</th><th>Payment reference</th></tr></thead><tbody>${invRows || '<tr><td colspan="6" class="q">No invoices issued yet.</td></tr>'}</tbody></table>
<h2>Requests and changes</h2><table><thead><tr><th>When (UTC)</th><th>Result</th><th>Request</th><th class="n">Price / time</th></tr></thead><tbody>${coRows || '<tr><td colspan="4" class="q">No requests recorded.</td></tr>'}</tbody></table>
<h2>Acceptances</h2><table><thead><tr><th>What</th><th>Typed name</th><th>When (UTC)</th><th>Fingerprint</th></tr></thead><tbody>${sigRows}</tbody></table>
<h2>Agreement fingerprint</h2><div class="mono">${esc(fingerprint)}</div>
<p class="note">This record shows that the person who opened this agreement link accepted it by typing the name shown, after ticking a consent box. It does not verify the signer's legal identity and is not an advanced or qualified electronic signature. The fingerprint is a code computed from the agreement's terms; if any amount or term is changed, the code no longer matches.</p>
</body></html>`;
  setResponseHeader(event, "content-type", "text/html; charset=utf-8");
  setResponseHeader(event, "cache-control", "no-store");
  return html;
});
