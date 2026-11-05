import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { audit, DEFAULT_OWNER, loadProject } from "../server/lib/project-data.js";

export default defineAction({
  description:
    "Count one revision round requested by the client against the project's included revisions. Returns how many are used, how many are included, and overLimit=true once the included revisions are exceeded (then the extra round is additional work and should become a priced change order).",
  schema: z.object({ projectId: z.string(), note: z.string().default("").describe("What the client asked to revise") }),
  outputSchema: z.object({ revisionsUsed: z.number(), revisionsIncluded: z.number(), remaining: z.number(), overLimit: z.boolean() }),
  run: async ({ projectId, note }, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const p = await loadProject(projectId, owner);
    if (!p) fail("Project not found.", { errorCode: "not_found", statusCode: 404 });
    const used = p.revisionsUsed + 1;
    await getDb().transaction(async (tx) => {
      await tx.update(schema.projects).set({ revisionsUsed: used }).where(eq(schema.projects.id, projectId));
      await audit(projectId, owner, "revision_logged", `round ${used} of ${p.revisionsIncluded} included${note ? `: ${note}` : ""}`, tx as never);
    });
    return { revisionsUsed: used, revisionsIncluded: p.revisionsIncluded, remaining: Math.max(0, p.revisionsIncluded - used), overLimit: used > p.revisionsIncluded };
  },
});
