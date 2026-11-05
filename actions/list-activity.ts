import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { DEFAULT_OWNER } from "../server/lib/project-data.js";

export default defineAction({
  description: "Audit trail for a project: scope versions and key events (locked, change proposed/approved/rejected, invoices, payments), newest first.",
  schema: z.object({ projectId: z.string() }),
  outputSchema: z.object({
    versions: z.array(z.object({ version: z.number(), totalCents: z.number(), reason: z.string(), createdAt: z.string() })),
    events: z.array(z.object({ kind: z.string(), detail: z.string(), createdAt: z.string() })),
    signatures: z.array(z.object({ kind: z.string(), version: z.number(), signerName: z.string(), acceptedAt: z.string(), fingerprint: z.string() })),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ projectId }, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const db = getDb();
    const vs = await db.select().from(schema.scopeVersions).where(and(eq(schema.scopeVersions.projectId, projectId), eq(schema.scopeVersions.ownerEmail, owner))).orderBy(schema.scopeVersions.version).limit(100);
    const ev = await db.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.projectId, projectId), eq(schema.auditEvents.ownerEmail, owner))).orderBy(schema.auditEvents.createdAt).limit(300);
    const sg = await db.select().from(schema.agreementAcceptances).where(and(eq(schema.agreementAcceptances.projectId, projectId), eq(schema.agreementAcceptances.ownerEmail, owner))).orderBy(schema.agreementAcceptances.acceptedAt).limit(100);
    return {
      signatures: sg.reverse().map((x) => ({ kind: x.kind, version: x.version, signerName: x.signerName, acceptedAt: x.acceptedAt, fingerprint: x.contentHash })),
      versions: vs.reverse().map((v) => ({ version: v.version, totalCents: v.totalCents, reason: v.reason, createdAt: v.createdAt })),
      events: ev.reverse().map((e) => ({ kind: e.kind, detail: e.detail, createdAt: e.createdAt })),
    };
  },
});
