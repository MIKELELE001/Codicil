import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { loadChange } from "../server/lib/change-load.js";
import { audit, DEFAULT_OWNER } from "../server/lib/project-data.js";

export default defineAction({
  description: "REJECT a pending change order. The agreement stays exactly as it was. Only call when the user explicitly rejects it.",
  schema: z.object({ id: z.string(), reason: z.string().default("") }),
  outputSchema: z.object({ status: z.string() }),
  run: async ({ id, reason }, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const c = await loadChange(id, owner);
    if (!c) fail("Change order not found.", { errorCode: "not_found", statusCode: 404 });
    if (c.co.status !== "pending") fail(`Already ${c.co.status}.`, { errorCode: "already_decided", statusCode: 409 });
    await getDb().transaction(async (tx) => {
      await tx.update(schema.changeOrders).set({ status: "rejected", decisionNote: reason, decidedAt: new Date().toISOString() }).where(eq(schema.changeOrders.id, id));
      await audit(c.co.projectId, owner, "change_rejected", c.co.summary, tx as never);
    });
    return { status: "rejected" };
  },
});
