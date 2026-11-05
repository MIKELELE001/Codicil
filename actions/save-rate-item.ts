import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Create or update a rate card entry (a service the freelancer sells). Omit id to create; pass id to change name, unit or USD rate. Rate is in dollars, e.g. 150 for $150 per page.",
  schema: z.object({
    id: z.string().optional().describe("Rate item id to update; omit to create"),
    name: z.string().min(1).describe('Service name, e.g. "Website page design"'),
    unit: z.string().min(1).describe('Billing unit, e.g. "page", "hour", "item"'),
    rateUsd: z.coerce.number().min(0).describe("Rate in USD per unit, e.g. 150"),
  }),
  outputSchema: z.object({
    id: z.string(),
    name: z.string(),
    unit: z.string(),
    rateCents: z.number(),
  }),
  run: async (args, ctx) => {
    const owner = ctx?.userEmail ?? "local@localhost";
    const rateCents = Math.round(args.rateUsd * 100);
    const r = schema.rateItems;
    if (args.id) {
      const updated = await getDb()
        .update(r)
        .set({ name: args.name, unit: args.unit, rateCents })
        .where(and(eq(r.id, args.id), eq(r.ownerEmail, owner)))
        .returning({ id: r.id });
      if (!updated.length)
        fail("Rate item not found.", { errorCode: "not_found", statusCode: 404 });
      return { id: args.id, name: args.name, unit: args.unit, rateCents };
    }
    const id = crypto.randomUUID();
    await getDb()
      .insert(r)
      .values({ id, name: args.name, unit: args.unit, rateCents, ownerEmail: owner });
    return { id, name: args.name, unit: args.unit, rateCents };
  },
});
