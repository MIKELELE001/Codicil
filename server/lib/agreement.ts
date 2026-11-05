import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { priceLine, totalCents } from "./pricing.js";
import { loadLines } from "./project-data.js";

type Project = typeof schema.projects.$inferSelect;

/** The agreement as the client sees it, plus a fingerprint of its exact contents. */
export async function buildAgreement(p: Project) {
  const lines = (await loadLines(p.id)).map(priceLine);
  const total = totalCents(lines);
  const deposit = Math.round((total * p.depositPercent) / 100);
  const core = {
    title: p.title,
    clientName: p.clientName,
    version: p.currentVersion,
    lines: lines.map(({ label, unit, quantity, rateCents, lineTotalCents }) => ({ label, unit, quantity, rateCents, lineTotalCents })),
    totalCents: total,
    included: p.scopeIncluded,
    excluded: p.scopeExcluded,
    revisionsIncluded: p.revisionsIncluded,
    schedule: [{ label: `Deposit (${p.depositPercent}%)`, amountCents: deposit }, { label: "Balance", amountCents: total - deposit }].filter((x) => x.amountCents > 0),
    payment: { currency: p.paymentCurrency, network: p.paymentNetwork, reference: p.paymentReference, terms: p.paymentTerms, rail: p.paymentRail, payerName: p.payerName, dueDays: p.paymentDueDays },
  };
  // The fingerprint covers the terms, not the version number, so it is the same just before and just after signing.
  const { version: _v, ...terms } = core;
  const fingerprint = createHash("sha256").update(JSON.stringify(terms)).digest("hex");
  return { core, fingerprint };
}

export async function projectByAgreementToken(token: string) {
  if (token.length < 32) return undefined;
  const [p] = await getDb().select().from(schema.projects).where(eq(schema.projects.agreementToken, token)).limit(1);
  return p && p.agreementStatus !== "none" ? p : undefined;
}

export function cleanSignerName(raw: unknown): string | null {
  const s = String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().replace(/\s+/g, " ");
  return s.length >= 2 && s.length <= 60 ? s : null;
}

export const SIGNATURE_LABEL = "Accepted electronically (typed name)";
export const IDENTITY_NOTE = "Signer identity is not verified. No email or ID was collected.";

export function consentText(kind: "agreement" | "change", version: number, fingerprint?: string) {
  return kind === "agreement"
    ? `By typing my name and clicking Accept, I agree to sign electronically, I intend my typed name to be my signature, and I agree to be bound by this agreement (version ${version}${fingerprint ? `, fingerprint ${fingerprint.slice(0, 12)}` : ""}).`
    : `By typing my name and clicking Accept, I agree to sign electronically, I intend my typed name to be my signature, and I agree to this change to the agreement (new version ${version}).`;
}

export async function recordAcceptance(p: Project, kind: "agreement" | "change", version: number, signerName: string, note: string, changeOrderId?: string, userAgent = "") {
  const fresh = (await getDb().select().from(schema.projects).where(eq(schema.projects.id, p.id)).limit(1))[0]!;
  const { fingerprint } = await buildAgreement(fresh);
  await getDb().insert(schema.agreementAcceptances).values({
    id: crypto.randomUUID(), projectId: p.id, kind, version, changeOrderId: changeOrderId ?? null,
    signerName, note: note.slice(0, 500), contentHash: fingerprint,
    consentText: consentText(kind, version, kind === "agreement" ? fingerprint : undefined), userAgent: userAgent.slice(0, 300), ownerEmail: p.ownerEmail,
  });
  return fingerprint;
}

export async function latestSharedChange(projectId: string) {
  const c = schema.changeOrders;
  const rows = await getDb().select().from(c).where(and(eq(c.projectId, projectId), eq(c.status, "pending"), eq(c.clientStatus, "sent"))).orderBy(c.createdAt).limit(10);
  return rows[rows.length - 1];
}
