import { defineAction, fail } from "@agent-native/core/action";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { audit, DEFAULT_OWNER, loadLines, loadProject } from "../server/lib/project-data.js";

export default defineAction({
  description:
    "Create or fetch the project's ONE living agreement link (/a/<token>). Before the client agrees, the link shows the proposal (scope, rate-card prices, payment schedule, payment details) and the client signs by typing any name they choose. After that it always shows the current agreement, its history, signatures, and any change order waiting for the client. Only call when the user asks to send or share the agreement. Optionally set what is included/excluded and revisions before the client agrees.",
  schema: z.object({
    projectId: z.string(),
    included: z.string().optional().describe("What the agreement includes (only before the client agrees)"),
    excluded: z.string().optional().describe("What is excluded (only before the client agrees)"),
    revisionsIncluded: z.coerce.number().int().min(0).optional(),
    validDays: z.coerce.number().int().min(0).max(365).optional().describe("How many days the proposal stays open for acceptance, counted from now; 0 = no expiry. Only before the client agrees."),
  }),
  outputSchema: z.object({ path: z.string(), state: z.string() }),
  run: async (a, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const p = await loadProject(a.projectId, owner);
    if (!p) fail("Project not found.", { errorCode: "not_found", statusCode: 404 });
    if (p.currentVersion === 0 && !(await loadLines(a.projectId)).length)
      fail("Add scope lines before sharing the agreement.", { errorCode: "empty_scope", statusCode: 400 });
    const token = p.agreementToken ?? randomBytes(24).toString("hex");
    const status = p.currentVersion > 0 ? "accepted" : "sent";
    const edits: Record<string, unknown> = { agreementToken: token, agreementStatus: p.agreementStatus === "accepted" ? "accepted" : status };
    if (p.currentVersion === 0) {
      if (a.included !== undefined) edits.scopeIncluded = a.included;
      if (a.excluded !== undefined) edits.scopeExcluded = a.excluded;
      if (a.revisionsIncluded !== undefined) edits.revisionsIncluded = a.revisionsIncluded;
      if (a.validDays !== undefined) edits.agreementExpiresAt = a.validDays === 0 ? null : new Date(Date.now() + a.validDays * 86400000).toISOString();
    }
    await getDb().transaction(async (tx) => {
      await tx.update(schema.projects).set(edits).where(eq(schema.projects.id, a.projectId));
      if (!p.agreementToken) await audit(a.projectId, owner, "agreement_link_created", p.title, tx as never);
    });
    return { path: `/a/${token}`, state: p.currentVersion > 0 ? "active" : "awaiting_acceptance" };
  },
});
