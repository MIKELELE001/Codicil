import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { audit, DEFAULT_OWNER } from "../server/lib/project-data.js";

export default defineAction({
  description: "Mark an invoice as paid, optionally recording a crypto transaction hash. Paid invoices are never rewritten by later change orders.",
  schema: z.object({ invoiceId: z.string(), txHash: z.string().default("") }),
  outputSchema: z.object({ status: z.string() }),
  run: async ({ invoiceId, txHash }, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const i = schema.invoices;
    const [inv] = await getDb().select().from(i).where(and(eq(i.id, invoiceId), eq(i.ownerEmail, owner))).limit(1);
    if (!inv) fail("Invoice not found.", { errorCode: "not_found", statusCode: 404 });
    if (inv.status === "paid") fail("Already paid.", { errorCode: "already_paid", statusCode: 409 });
    await getDb().transaction(async (tx) => {
      await tx.update(i).set({ status: "paid", txHash, paidAt: new Date().toISOString() }).where(eq(i.id, invoiceId));
      await audit(inv.projectId, owner, "invoice_paid", `${inv.number} ${inv.amountCents} cents`, tx as never);
    });
    return { status: "paid" };
  },
});
