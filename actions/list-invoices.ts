import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { DEFAULT_OWNER } from "../server/lib/project-data.js";

export default defineAction({
  description: "List a project's invoices (deposit, balance, adjustments) with amounts in USD cents and paid status.",
  schema: z.object({ projectId: z.string() }),
  outputSchema: z.object({
    invoices: z.array(z.object({ id: z.string(), number: z.string(), kind: z.string(), label: z.string(), amountCents: z.number(), status: z.string(), txHash: z.string(), dueAt: z.string().nullable(), overdue: z.boolean(), daysOverdue: z.number() })),
    overdueCents: z.number(),
    totalCents: z.number(),
    paidCents: z.number(),
    outstandingCents: z.number(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ projectId }, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const i = schema.invoices;
    const rows = await getDb().select().from(i).where(and(eq(i.projectId, projectId), eq(i.ownerEmail, owner))).orderBy(i.createdAt).limit(100);
    const total = rows.reduce((s, r) => s + r.amountCents, 0);
    const paid = rows.filter((r) => r.status === "paid").reduce((s, r) => s + r.amountCents, 0);
    return {
      invoices: rows.map((r) => {
        const late = r.status !== "paid" && !!r.dueAt && new Date(r.dueAt).getTime() < Date.now();
        return { id: r.id, number: r.number, kind: r.kind, label: r.label, amountCents: r.amountCents, status: r.status, txHash: r.txHash, dueAt: r.dueAt, overdue: late, daysOverdue: late ? Math.floor((Date.now() - new Date(r.dueAt!).getTime()) / 86400000) : 0 };
      }),
      overdueCents: rows.filter((r) => r.status !== "paid" && !!r.dueAt && new Date(r.dueAt).getTime() < Date.now()).reduce((x, r) => x + r.amountCents, 0),
      totalCents: total, paidCents: paid, outstandingCents: total - paid,
    };
  },
});
