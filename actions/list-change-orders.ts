import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { DEFAULT_OWNER } from "../server/lib/project-data.js";

export default defineAction({
  description: "List a project's client requests and change orders (newest first) with classification, status and price delta in USD cents.",
  schema: z.object({ projectId: z.string() }),
  outputSchema: z.object({
    changeOrders: z.array(z.object({ id: z.string(), classification: z.string(), status: z.string(), summary: z.string(), evidence: z.string(), deltaCents: z.number(), timelineDeltaDays: z.number(), createdAt: z.string() })),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ projectId }, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const c = schema.changeOrders;
    const rows = await getDb().select().from(c).where(and(eq(c.projectId, projectId), eq(c.ownerEmail, owner))).orderBy(c.createdAt).limit(200);
    return { changeOrders: rows.reverse().map((r) => ({ id: r.id, classification: r.classification, status: r.status, summary: r.summary, evidence: r.evidence, deltaCents: r.deltaCents, timelineDeltaDays: r.timelineDeltaDays, createdAt: r.createdAt })) };
  },
});
