import { defineAction, fail } from "@agent-native/core/action";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { loadChange } from "../server/lib/change-load.js";
import { audit, DEFAULT_OWNER } from "../server/lib/project-data.js";

export default defineAction({
  description:
    "Create a private client approval link for a PENDING change order. The freelancer is authorising the change by sending it; when the client clicks Accept the change is applied automatically. Only call when the user explicitly asks to send or share it with the client. Returns a relative path like /c/<token>.",
  schema: z.object({ id: z.string().describe("Change order id") }),
  outputSchema: z.object({ path: z.string(), clientStatus: z.string() }),
  run: async ({ id }, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const c = await loadChange(id, owner);
    if (!c) fail("Change order not found.", { errorCode: "not_found", statusCode: 404 });
    if (c.co.status !== "pending") fail(`Already ${c.co.status}.`, { errorCode: "already_decided", statusCode: 409 });
    const token = c.co.clientToken ?? randomBytes(24).toString("hex");
    await getDb().transaction(async (tx) => {
      await tx.update(schema.changeOrders).set({ clientToken: token, clientStatus: "sent" }).where(eq(schema.changeOrders.id, id));
      await audit(c.co.projectId, owner, "change_sent_to_client", c.co.summary, tx as never);
    });
    return { path: `/c/${token}`, clientStatus: "sent" };
  },
});
