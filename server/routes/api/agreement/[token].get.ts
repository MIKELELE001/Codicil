import { and, eq } from "drizzle-orm";
import { createError, defineEventHandler, getRouterParam } from "h3";

import { getDb, schema } from "../../../db/index.js";
import { buildAgreement, consentText, IDENTITY_NOTE, latestSharedChange, projectByAgreementToken, SIGNATURE_LABEL } from "../../../lib/agreement.js";
import { applyItems, diff } from "../../../lib/changes.js";
import { loadChange } from "../../../lib/change-load.js";
import { priceLine } from "../../../lib/pricing.js";
import { loadLines } from "../../../lib/project-data.js";

/** Public, token-gated, read-only. One living link per project. */
export default defineEventHandler(async (event) => {
  const p = await projectByAgreementToken(getRouterParam(event, "token") ?? "");
  if (!p) throw createError({ statusCode: 404, statusMessage: "Not found" });
  const db = getDb();
  const { core, fingerprint } = await buildAgreement(p);
  const secs = await db.select().from(schema.proposalSections).where(and(eq(schema.proposalSections.projectId, p.id), eq(schema.proposalSections.ownerEmail, p.ownerEmail))).orderBy(schema.proposalSections.sortOrder).limit(20);
  const vs = await db.select().from(schema.scopeVersions).where(eq(schema.scopeVersions.projectId, p.id)).orderBy(schema.scopeVersions.version).limit(100);
  const acc = await db.select().from(schema.agreementAcceptances).where(eq(schema.agreementAcceptances.projectId, p.id)).orderBy(schema.agreementAcceptances.acceptedAt).limit(100);
  const approved = await db.select().from(schema.changeOrders).where(and(eq(schema.changeOrders.projectId, p.id), eq(schema.changeOrders.status, "approved"))).limit(200);
  const totalExtraDays = approved.reduce((n, c) => n + c.timelineDeltaDays, 0);
  let pendingChange = null;
  const co = await latestSharedChange(p.id);
  if (co) {
    const c = await loadChange(co.id, p.ownerEmail);
    const current = await loadLines(p.id);
    const before = current.map(priceLine);
    const after = applyItems(current, c!.items);
    const strip = (l: { label: string; unit: string; quantity: number; rateCents: number; lineTotalCents: number }) => ({ label: l.label, unit: l.unit, quantity: l.quantity, rateCents: l.rateCents, lineTotalCents: l.lineTotalCents });
    pendingChange = { summary: co.summary, timelineDeltaDays: co.timelineDeltaDays, before: before.map(strip), after: after.map(strip), ...diff(before, after) };
  }
  const expired = p.currentVersion === 0 && !!p.agreementExpiresAt && new Date(p.agreementExpiresAt).getTime() < Date.now();
  return {
    state: expired ? "expired" : p.currentVersion === 0 ? "awaiting_acceptance" : "active",
    expiresAt: p.currentVersion === 0 ? p.agreementExpiresAt : null,
    revisionsUsed: p.revisionsUsed,
    totalExtraDays,
    signatureLabel: SIGNATURE_LABEL,
    identityNote: IDENTITY_NOTE,
    consent: { agreement: consentText("agreement", 1, fingerprint), change: consentText("change", p.currentVersion + 1) },
    ...core,
    fingerprint,
    sections: secs.map((s) => ({ key: s.key, title: s.title, content: s.content })),
    versions: vs.reverse().map((v) => ({ version: v.version, totalCents: v.totalCents, reason: v.reason, createdAt: v.createdAt })),
    signatures: acc.map((a) => ({ kind: a.kind, version: a.version, signerName: a.signerName, acceptedAt: a.acceptedAt, fingerprint: a.contentHash })),
    pendingChange,
    privacyNote: "No personal details are collected. Sign with any name you are comfortable with.",
  };
});
