import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Item } from "./changes.js";

export async function loadChange(id: string, owner: string) {
  const db = getDb();
  const [co] = await db
    .select()
    .from(schema.changeOrders)
    .where(and(eq(schema.changeOrders.id, id), eq(schema.changeOrders.ownerEmail, owner)))
    .limit(1);
  if (!co) return undefined;
  const rows = await db.select().from(schema.changeOrderItems).where(eq(schema.changeOrderItems.changeOrderId, id)).limit(50);
  const items: (Item & { rowId: string; rateItemId: string | null; overridden: number })[] = rows.map((r) => ({
    op: r.op, scopeItemId: r.scopeItemId, label: r.label, unit: r.unit, quantity: r.quantity,
    rateCents: r.rateCents, newId: r.id, rowId: r.id, rateItemId: r.rateItemId, overridden: r.rateOverridden,
  }));
  return { co, items };
}
