import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Add or update one scope line on a project. Price comes from the rate card via rateItemId (never invent a price). Omit id to add; pass id to change quantity, label or rate. Set customRateUsd only when the user explicitly states a custom rate for this line.",
  schema: z.object({
    projectId: z.string().describe("Project id"),
    id: z.string().optional().describe("Scope item id to update; omit to add"),
    rateItemId: z.string().optional().describe("Rate card id from list-rate-items; required when adding unless customRateUsd and unit are given"),
    label: z.string().optional().describe('Line description, e.g. "Portfolio section"; defaults to the rate item name'),
    quantity: z.coerce.number().positive().default(1).describe("How many units, e.g. 5 pages; defaults to 1"),
    customRateUsd: z.coerce.number().min(0).optional().describe("User-stated custom USD rate per unit; overrides the rate card for this line only"),
  }),
  outputSchema: z.object({
    id: z.string(),
    label: z.string(),
    quantity: z.number(),
    rateCents: z.number(),
    lineTotalCents: z.number(),
  }),
  run: async (args, ctx) => {
    const owner = ctx?.userEmail ?? "local@localhost";
    const db = getDb();
    const { projects, rateItems, scopeItems: s } = schema;
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, args.projectId), eq(projects.ownerEmail, owner)))
      .limit(1);
    if (!project) fail("Project not found.", { errorCode: "not_found", statusCode: 404 });

    let rate: { id: string; name: string; unit: string; rateCents: number } | undefined;
    if (args.rateItemId) {
      [rate] = await db
        .select({ id: rateItems.id, name: rateItems.name, unit: rateItems.unit, rateCents: rateItems.rateCents })
        .from(rateItems)
        .where(and(eq(rateItems.id, args.rateItemId), eq(rateItems.ownerEmail, owner)))
        .limit(1);
      if (!rate) fail("Rate item not found. Call list-rate-items.", { errorCode: "rate_not_found", statusCode: 404 });
    }
    const overridden = args.customRateUsd !== undefined;

    if (args.id) {
      const [existing] = await db
        .select()
        .from(s)
        .where(and(eq(s.id, args.id), eq(s.projectId, args.projectId), eq(s.ownerEmail, owner)))
        .limit(1);
      if (!existing) fail("Scope item not found.", { errorCode: "not_found", statusCode: 404 });
      const rateCents = overridden
        ? Math.round(args.customRateUsd! * 100)
        : rate
          ? rate.rateCents
          : existing.rateCents;
      const label = args.label ?? existing.label;
      await db
        .update(s)
        .set({
          label,
          quantity: args.quantity,
          rateCents,
          rateItemId: rate?.id ?? existing.rateItemId,
          rateOverridden: overridden ? 1 : rate ? 0 : existing.rateOverridden,
        })
        .where(eq(s.id, args.id));
      return { id: args.id, label, quantity: args.quantity, rateCents, lineTotalCents: Math.round(args.quantity * rateCents) };
    }

    if (!rate) fail("Pick a rate card entry (rateItemId) so the price is grounded.", { errorCode: "rate_required" });
    const rateCents = overridden ? Math.round(args.customRateUsd! * 100) : rate.rateCents;
    const id = crypto.randomUUID();
    const label = args.label ?? rate.name;
    await db.insert(s).values({
      id,
      projectId: args.projectId,
      rateItemId: rate.id,
      label,
      unit: rate.unit,
      quantity: args.quantity,
      rateCents,
      rateOverridden: overridden ? 1 : 0,
      ownerEmail: owner,
    });
    return { id, label, quantity: args.quantity, rateCents, lineTotalCents: Math.round(args.quantity * rateCents) };
  },
});
