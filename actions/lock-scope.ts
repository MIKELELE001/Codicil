import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ChangeError } from "../server/lib/apply-change.js";
import { lockScopeV1 } from "../server/lib/lock.js";
import { DEFAULT_OWNER, loadProject } from "../server/lib/project-data.js";

export default defineAction({
  description:
    "Lock the project's scope as the agreed baseline (version 1) when the freelancer confirms the client already agreed outside the app. For a client who agrees through the app, use publish-agreement instead. After locking, client requests become change orders. Also records what is included and excluded.",
  schema: z.object({
    projectId: z.string(),
    included: z.string().default("").describe("What the agreement includes, plain text"),
    excluded: z.string().default("").describe("What is explicitly excluded, plain text"),
    revisionsIncluded: z.coerce.number().int().min(0).default(2),
  }),
  outputSchema: z.object({ version: z.number(), totalCents: z.number() }),
  run: async (a, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const p = await loadProject(a.projectId, owner);
    if (!p) fail("Project not found.", { errorCode: "not_found", statusCode: 404 });
    if (p.currentVersion > 0) fail("Scope is already locked.", { errorCode: "already_locked", statusCode: 409 });
    await getDb().update(schema.projects).set({ scopeIncluded: a.included, scopeExcluded: a.excluded, revisionsIncluded: a.revisionsIncluded }).where(eq(schema.projects.id, a.projectId));
    try {
      return await lockScopeV1(a.projectId, owner, "freelancer");
    } catch (e) {
      if (e instanceof ChangeError) fail(e.message, { errorCode: e.code, statusCode: e.status });
      throw e;
    }
  },
});
