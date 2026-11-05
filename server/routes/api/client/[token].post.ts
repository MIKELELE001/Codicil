import { eq } from "drizzle-orm";
import { createError, defineEventHandler, getRouterParam, readBody } from "h3";

import { getDb, schema } from "../../../db/index.js";
import { applyChangeOrder, ChangeError } from "../../../lib/apply-change.js";
import { audit } from "../../../lib/project-data.js";

/** Public, token-gated. Client accepts or declines a shared change order. */
export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, "token") ?? "";
  const body = (await readBody(event)) as { decision?: string; comment?: string } | undefined;
  const decision = body?.decision;
  const comment = String(body?.comment ?? "").slice(0, 1000);
  if (token.length < 32 || (decision !== "accept" && decision !== "decline"))
    throw createError({ statusCode: 400, statusMessage: "Bad request" });
  const db = getDb();
  const [row] = await db.select().from(schema.changeOrders).where(eq(schema.changeOrders.clientToken, token)).limit(1);
  if (!row || row.clientStatus === "none") throw createError({ statusCode: 404, statusMessage: "Not found" });
  if (row.status !== "pending") throw createError({ statusCode: 409, statusMessage: `Already ${row.status}` });
  try {
    const now = new Date().toISOString();
    if (decision === "accept") {
      const r = await applyChangeOrder(row.id, row.ownerEmail, "Accepted by client", "client");
      await db.update(schema.changeOrders).set({ clientStatus: "accepted", clientComment: comment, clientRespondedAt: now }).where(eq(schema.changeOrders.id, row.id));
      return { ok: true, clientStatus: "accepted", version: r.version };
    }
    await db.update(schema.changeOrders).set({ status: "rejected", clientStatus: "declined", clientComment: comment, clientRespondedAt: now, decidedAt: now }).where(eq(schema.changeOrders.id, row.id));
    await audit(row.projectId, row.ownerEmail, "change_declined_by_client", row.summary);
    return { ok: true, clientStatus: "declined" };
  } catch (e) {
    if (e instanceof ChangeError) throw createError({ statusCode: e.status, statusMessage: e.message });
    throw e;
  }
});
