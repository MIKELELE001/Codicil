import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "List the freelancer's rate card: every service with its unit and USD rate in cents. Pricing for scope items must come from these rates.",
  schema: z.object({}),
  outputSchema: z.object({
    rateItems: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        unit: z.string(),
        rateCents: z.number(),
      }),
    ),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => {
    const owner = ctx?.userEmail ?? "local@localhost";
    const r = schema.rateItems;
    const rows = await getDb()
      .select({ id: r.id, name: r.name, unit: r.unit, rateCents: r.rateCents })
      .from(r)
      .where(eq(r.ownerEmail, owner))
      .orderBy(r.name)
      .limit(200);
    return { rateItems: rows };
  },
});
