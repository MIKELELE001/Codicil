import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";

type Db = ReturnType<typeof getDb>;

/** After an approved change: adjust the unpaid balance invoice, or add an adjustment. Paid invoices are never rewritten. */
export async function reconcileInvoices(tx: Db, projectId: string, owner: string, deltaCents: number, versionLabel: string) {
  const inv = schema.invoices;
  const proj = (await tx.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1))[0];
  const all = await tx.select().from(inv).where(and(eq(inv.projectId, projectId), eq(inv.ownerEmail, owner)));
  if (!all.length || deltaCents === 0) return;
  const unpaidBalance = all.find((i) => (i.kind === "balance" || i.kind === "full") && i.status !== "paid" && i.amountCents + deltaCents >= 0);
  if (unpaidBalance) {
    await tx.update(inv).set({ amountCents: unpaidBalance.amountCents + deltaCents }).where(eq(inv.id, unpaidBalance.id));
    return;
  }
  const base = all[0]!.number.replace(/-[A-Z]+$/, "");
  await tx.insert(inv).values({
    id: crypto.randomUUID(), projectId, number: `${base}-ADJ${all.length}`, kind: "adjustment",
    label: `Change order ${versionLabel}`, amountCents: deltaCents, ownerEmail: owner,
    dueAt: new Date(Date.now() + (proj?.paymentDueDays ?? 14) * 86400000).toISOString(),
  });
}
