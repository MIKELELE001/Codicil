import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { applyItems, diff } from "../server/lib/changes.js";
import { loadChange } from "../server/lib/change-load.js";
import { priceLine } from "../server/lib/pricing.js";
import { DEFAULT_OWNER, loadLines } from "../server/lib/project-data.js";

const line = z.object({ id: z.string(), label: z.string(), unit: z.string(), quantity: z.number(), rateCents: z.number(), lineTotalCents: z.number() });

export default defineAction({
  description:
    "Show a change order as a before/after diff: current scope lines, proposed lines, totals, delta, timeline impact, evidence and the drafted client reply. Use this to present a pending change for approval.",
  schema: z.object({ id: z.string().describe("Change order id") }),
  outputSchema: z.object({
    id: z.string(), status: z.string(), classification: z.string(), summary: z.string(), evidence: z.string(),
    clientReplyDraft: z.string(), timelineDeltaDays: z.number(), baseVersion: z.number(),
    before: z.array(line), after: z.array(line),
    beforeTotalCents: z.number(), afterTotalCents: z.number(), deltaCents: z.number(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ id }, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const c = await loadChange(id, owner);
    if (!c) fail("Change order not found.", { errorCode: "not_found", statusCode: 404 });
    const current = await loadLines(c.co.projectId);
    const before = current.map(priceLine);
    const after = c.co.status === "pending" ? applyItems(current, c.items) : before;
    const d = diff(before, after);
    return {
      id: c.co.id, status: c.co.status, classification: c.co.classification, summary: c.co.summary,
      evidence: c.co.evidence, clientReplyDraft: c.co.clientReplyDraft, timelineDeltaDays: c.co.timelineDeltaDays,
      baseVersion: c.co.baseVersion, before, after, ...d,
    };
  },
});
