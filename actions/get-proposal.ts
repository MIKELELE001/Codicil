import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { priceLine, totalCents } from "../server/lib/pricing.js";
import { DEFAULT_OWNER, loadLines, loadProject } from "../server/lib/project-data.js";

export default defineAction({
  description:
    "Get the full client proposal for a project: editable prose sections plus a price table and payment schedule generated from the current scope. Totals are computed by code. Use this to preview or review the proposal.",
  schema: z.object({ projectId: z.string() }),
  outputSchema: z.object({
    title: z.string(), clientName: z.string(), version: z.number(),
    included: z.string(), excluded: z.string(), revisionsIncluded: z.number(),
    sections: z.array(z.object({ key: z.string(), title: z.string(), content: z.string(), edited: z.boolean() })),
    lines: z.array(z.object({ label: z.string(), unit: z.string(), quantity: z.number(), rateCents: z.number(), lineTotalCents: z.number() })),
    totalCents: z.number(),
    schedule: z.array(z.object({ label: z.string(), amountCents: z.number() })),
    payment: z.object({ currency: z.string(), network: z.string(), reference: z.string(), terms: z.string() }),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ projectId }, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const p = await loadProject(projectId, owner);
    if (!p) fail("Project not found.", { errorCode: "not_found", statusCode: 404 });
    const t = schema.proposalSections;
    const secs = await getDb().select().from(t).where(and(eq(t.projectId, projectId), eq(t.ownerEmail, owner))).orderBy(t.sortOrder).limit(20);
    const lines = (await loadLines(projectId)).map(priceLine);
    const total = totalCents(lines);
    const deposit = Math.round((total * p.depositPercent) / 100);
    return {
      title: p.title, clientName: p.clientName, version: p.currentVersion,
      included: p.scopeIncluded, excluded: p.scopeExcluded, revisionsIncluded: p.revisionsIncluded,
      sections: secs.map((s) => ({ key: s.key, title: s.title, content: s.content, edited: s.edited === 1 })),
      lines: lines.map(({ label, unit, quantity, rateCents, lineTotalCents }) => ({ label, unit, quantity, rateCents, lineTotalCents })),
      totalCents: total,
      schedule: [{ label: `Deposit (${p.depositPercent}%)`, amountCents: deposit }, { label: "Balance", amountCents: total - deposit }].filter((x) => x.amountCents > 0),
      payment: { currency: p.paymentCurrency, network: p.paymentNetwork, reference: p.paymentReference, terms: p.paymentTerms },
    };
  },
});
