import { eq } from "drizzle-orm";
import { createError, defineEventHandler, getRouterParam } from "h3";

import { getDb, schema } from "../../../db/index.js";
import { applyItems, diff } from "../../../lib/changes.js";
import { loadChange } from "../../../lib/change-load.js";
import { priceLine } from "../../../lib/pricing.js";
import { loadLines } from "../../../lib/project-data.js";

/** Public, token-gated. Returns only what the client needs to decide. */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  if (token.length < 32) throw createError({ statusCode: 404, statusMessage: "Not found" });
  const [row] = await getDb().select().from(schema.changeOrders).where(eq(schema.changeOrders.clientToken, token)).limit(1);
  if (!row || row.clientStatus === "none") throw createError({ statusCode: 404, statusMessage: "Not found" });
  const c = await loadChange(row.id, row.ownerEmail);
  const [p] = await getDb().select().from(schema.projects).where(eq(schema.projects.id, row.projectId)).limit(1);
  const current = await loadLines(row.projectId);
  const before = current.map(priceLine);
  const after = row.status === "pending" ? applyItems(current, c!.items) : before;
  const d = diff(before, after);
  const strip = (l: { label: string; unit: string; quantity: number; rateCents: number; lineTotalCents: number }) => ({
    label: l.label, unit: l.unit, quantity: l.quantity, rateCents: l.rateCents, lineTotalCents: l.lineTotalCents,
  });
  return {
    projectTitle: p?.title ?? "", clientName: p?.clientName ?? "",
    summary: row.summary, status: row.status, clientStatus: row.clientStatus, clientComment: row.clientComment,
    timelineDeltaDays: row.timelineDeltaDays, currency: p?.paymentCurrency ?? "USD",
    before: before.map(strip), after: after.map(strip), ...d,
  };
});
