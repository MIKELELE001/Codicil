import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { audit, DEFAULT_OWNER, loadProject } from "../server/lib/project-data.js";

export default defineAction({
  description:
    "Create the invoice schedule from the current locked scope: a deposit invoice (project's deposit percent) and a balance invoice for the rest. Amounts come from the locked total, never from the model. Can only run once per project; later changes adjust the unpaid balance or add an adjustment invoice automatically.",
  schema: z.object({ projectId: z.string() }),
  outputSchema: z.object({ invoices: z.array(z.object({ id: z.string(), number: z.string(), kind: z.string(), amountCents: z.number() })) }),
  run: async ({ projectId }, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const p = await loadProject(projectId, owner);
    if (!p) fail("Project not found.", { errorCode: "not_found", statusCode: 404 });
    if (p.currentVersion < 1) fail("Lock the scope first.", { errorCode: "scope_not_locked", statusCode: 409 });
    const db = getDb();
    const existing = await db.select({ id: schema.invoices.id }).from(schema.invoices).where(eq(schema.invoices.projectId, projectId)).limit(1);
    if (existing.length) fail("Invoices already exist for this project.", { errorCode: "already_exists", statusCode: 409 });
    const [v] = await db.select().from(schema.scopeVersions)
      .where(and(eq(schema.scopeVersions.projectId, projectId), eq(schema.scopeVersions.version, p.currentVersion))).limit(1);
    if (!v) fail("Locked scope version not found.", { errorCode: "version_missing", statusCode: 500 });
    const total = v.totalCents;
    const deposit = Math.round((total * p.depositPercent) / 100);
    const base = `INV-${p.id.slice(0, 4).toUpperCase()}`;
    const rows = [
      { kind: "deposit" as const, label: `Deposit (${p.depositPercent}%)`, amountCents: deposit, number: `${base}-A` },
      { kind: "balance" as const, label: "Balance", amountCents: total - deposit, number: `${base}-B` },
    ].filter((r) => r.amountCents > 0).map((r) => ({ ...r, id: crypto.randomUUID(), projectId, ownerEmail: owner, dueAt: new Date(Date.now() + p.paymentDueDays * 86400000).toISOString() }));
    await db.transaction(async (tx) => {
      await tx.insert(schema.invoices).values(rows);
      await tx.update(schema.projects).set({ status: "invoice_pending" }).where(eq(schema.projects.id, projectId));
      await audit(projectId, owner, "invoices_created", `${rows.length} invoices, total ${total} cents`, tx as never);
    });
    return { invoices: rows.map((r) => ({ id: r.id, number: r.number, kind: r.kind, amountCents: r.amountCents })) };
  },
});
