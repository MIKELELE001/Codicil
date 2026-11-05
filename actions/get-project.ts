import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { priceLine, totalCents } from "../server/lib/pricing.js";

export default defineAction({
  description:
    "Get one project with its priced scope lines and the total in USD cents. Totals are computed by code from the rate card, never by the model.",
  schema: z.object({ id: z.string().describe("Project id") }),
  outputSchema: z.object({
    id: z.string(),
    title: z.string(),
    clientName: z.string(),
    status: z.string(),
    brief: z.string(),
    lines: z.array(
      z.object({
        id: z.string(),
        label: z.string(),
        unit: z.string(),
        quantity: z.number(),
        rateCents: z.number(),
        lineTotalCents: z.number(),
      }),
    ),
    totalCents: z.number(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ id }, ctx) => {
    const owner = ctx?.userEmail ?? "local@localhost";
    const db = getDb();
    const [p] = await db
      .select()
      .from(schema.projects)
      .where(and(eq(schema.projects.id, id), eq(schema.projects.ownerEmail, owner)))
      .limit(1);
    if (!p) fail("Project not found.", { errorCode: "not_found", statusCode: 404 });
    const rows = await db
      .select()
      .from(schema.scopeItems)
      .where(eq(schema.scopeItems.projectId, id))
      .orderBy(schema.scopeItems.createdAt)
      .limit(200);
    const lines = rows.map((r) =>
      priceLine({ id: r.id, label: r.label, unit: r.unit, quantity: r.quantity, rateCents: r.rateCents }),
    );
    return {
      id: p.id,
      title: p.title,
      clientName: p.clientName,
      status: p.status,
      brief: p.brief,
      lines,
      totalCents: totalCents(lines),
    };
  },
});
