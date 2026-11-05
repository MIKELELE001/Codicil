import { defineAction, fail } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { applyItems, diff, type Item } from "../server/lib/changes.js";
import { priceLine } from "../server/lib/pricing.js";
import { audit, DEFAULT_OWNER, loadLines, loadProject } from "../server/lib/project-data.js";

const itemSchema = z.object({
  op: z.enum(["add", "update", "remove"]),
  scopeItemId: z.string().optional().describe("Required for update/remove: id of an existing scope line"),
  rateItemId: z.string().optional().describe("Rate card id from list-rate-items. Required for add. Never invent prices."),
  label: z.string().optional(),
  quantity: z.coerce.number().positive().optional().describe("Units; defaults to 1 for add"),
  customRateUsd: z.coerce.number().min(0).optional().describe("Only if the user explicitly stated a custom rate"),
});

export default defineAction({
  description:
    "Analyse a client request against the LOCKED scope and record the result. Classify as included (already covered), unclear (needs a question to the client) or additional (outside scope). Only 'additional' may carry items; they are priced from the rate card by code and wait for freelancer approval. This NEVER changes the agreement; the freelancer approves separately. Quote the exact client sentence as evidence and draft a polite client reply.",
  schema: z.object({
    projectId: z.string(),
    classification: z.enum(["included", "unclear", "additional"]),
    summary: z.string().min(1).describe("One line: what the client is asking for"),
    evidence: z.string().min(1).describe("Exact sentence from the client message that led to the classification"),
    sourceMessage: z.string().default("").describe("The full pasted client message"),
    clientReplyDraft: z.string().default("").describe("Polite draft reply to the client"),
    timelineDeltaDays: z.coerce.number().int().default(0).describe("Estimated extra days; 0 if none"),
    items: z.array(itemSchema).default([]),
  }),
  outputSchema: z.object({
    changeOrderId: z.string(),
    status: z.string(),
    classification: z.string(),
    beforeTotalCents: z.number(),
    afterTotalCents: z.number(),
    deltaCents: z.number(),
  }),
  run: async (a, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const db = getDb();
    const p = await loadProject(a.projectId, owner);
    if (!p) fail("Project not found.", { errorCode: "not_found", statusCode: 404 });
    if (p.currentVersion < 1) fail("Lock the scope first (lock-scope).", { errorCode: "scope_not_locked", statusCode: 409 });
    if (a.classification !== "additional" && a.items.length)
      fail("Only 'additional' requests can carry priced items.", { errorCode: "items_not_allowed", statusCode: 400 });
    if (a.classification === "additional" && !a.items.length)
      fail("An 'additional' request needs at least one item.", { errorCode: "items_required", statusCode: 400 });

    const current = await loadLines(a.projectId);
    const rateIds = [...new Set(a.items.map((i) => i.rateItemId).filter(Boolean))] as string[];
    const rates = rateIds.length
      ? await db.select().from(schema.rateItems).where(and(inArray(schema.rateItems.id, rateIds), eq(schema.rateItems.ownerEmail, owner)))
      : [];
    const items: (Item & { rateItemId: string | null; overridden: number })[] = [];
    for (const i of a.items) {
      const rate = rates.find((r) => r.id === i.rateItemId);
      if (i.rateItemId && !rate) fail("Unknown rate item. Call list-rate-items.", { errorCode: "rate_not_found", statusCode: 404 });
      const existing = current.find((l) => l.id === i.scopeItemId);
      if (i.op !== "add" && !existing) fail("Scope line not found.", { errorCode: "line_not_found", statusCode: 404 });
      if (i.op === "add" && !rate) fail("Adding work needs a rate card entry (rateItemId).", { errorCode: "rate_required", statusCode: 400 });
      const overridden = i.customRateUsd !== undefined;
      const rateCents = overridden ? Math.round(i.customRateUsd! * 100) : rate ? rate.rateCents : existing!.rateCents;
      items.push({
        op: i.op,
        scopeItemId: i.scopeItemId ?? null,
        label: i.label ?? rate?.name ?? existing?.label ?? "Item",
        unit: rate?.unit ?? existing?.unit ?? "item",
        quantity: i.quantity ?? existing?.quantity ?? 1,
        rateCents,
        newId: crypto.randomUUID(),
        rateItemId: rate?.id ?? null,
        overridden: overridden ? 1 : 0,
      });
    }
    const before = current.map(priceLine);
    const after = applyItems(current, items);
    const d = diff(before, after);
    const id = crypto.randomUUID();
    const status = a.classification === "additional" ? "pending" : "noted";
    await db.transaction(async (tx) => {
      await tx.insert(schema.changeOrders).values({
        id, projectId: a.projectId, baseVersion: p.currentVersion, classification: a.classification, status,
        summary: a.summary, evidence: a.evidence, sourceMessage: a.sourceMessage,
        clientReplyDraft: a.clientReplyDraft, timelineDeltaDays: a.timelineDeltaDays,
        deltaCents: d.deltaCents, ownerEmail: owner,
      });
      if (items.length)
        await tx.insert(schema.changeOrderItems).values(
          items.map((it) => ({
            id: it.newId!, changeOrderId: id, op: it.op, scopeItemId: it.scopeItemId, rateItemId: it.rateItemId,
            label: it.label, unit: it.unit, quantity: it.quantity, rateCents: it.rateCents,
            rateOverridden: it.overridden, ownerEmail: owner,
          })),
        );
      await audit(a.projectId, owner, "change_proposed", `${a.classification}: ${a.summary}`, tx as never);
    });
    return { changeOrderId: id, status, classification: a.classification, beforeTotalCents: d.beforeTotalCents, afterTotalCents: d.afterTotalCents, deltaCents: d.deltaCents };
  },
});
