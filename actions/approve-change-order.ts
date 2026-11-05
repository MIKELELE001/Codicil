import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { applyChangeOrder, ChangeError } from "../server/lib/apply-change.js";
import { DEFAULT_OWNER } from "../server/lib/project-data.js";

export default defineAction({
  description:
    "APPROVE a pending change order. Only call this when the user has explicitly said to approve it. Applies the change in one transaction, creates a new scope version, adjusts unpaid invoices (or adds an adjustment invoice), and sets the project back to proposal_drafted. Safe to retry: an already-decided change order is rejected, never applied twice.",
  schema: z.object({ id: z.string().describe("Change order id"), note: z.string().default("") }),
  outputSchema: z.object({ version: z.number(), totalCents: z.number(), deltaCents: z.number() }),
  run: async ({ id, note }, ctx) => {
    try {
      return await applyChangeOrder(id, ctx?.userEmail ?? DEFAULT_OWNER, note, "freelancer");
    } catch (e) {
      if (e instanceof ChangeError) fail(e.message, { errorCode: e.code, statusCode: e.status });
      throw e;
    }
  },
});
