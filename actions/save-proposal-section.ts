import { defineAction, fail } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { DEFAULT_OWNER, loadProject } from "../server/lib/project-data.js";

const TITLES: Record<string, [string, number]> = {
  overview: ["Project overview", 0], scope: ["Scope of work", 1], timeline: ["Timeline", 2],
  payment: ["Payment terms", 3], terms: ["Conditions", 4],
};

export default defineAction({
  description:
    "Create or update one prose section of the client proposal (overview, scope, timeline, payment, terms). The price table is NOT a section: it is generated from the scope by get-proposal. Pass fromUser=true when the freelancer typed the text themselves; the agent must not overwrite a hand-edited section unless the user asks.",
  schema: z.object({
    projectId: z.string(),
    key: z.enum(["overview", "scope", "timeline", "payment", "terms"]),
    content: z.string().min(1).describe("Section text, plain paragraphs. No prices unless copied from get-project."),
    fromUser: z.boolean().default(false),
  }),
  outputSchema: z.object({ key: z.string(), edited: z.boolean() }),
  run: async (a, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const p = await loadProject(a.projectId, owner);
    if (!p) fail("Project not found.", { errorCode: "not_found", statusCode: 404 });
    const t = schema.proposalSections;
    const db = getDb();
    const [ex] = await db.select().from(t).where(and(eq(t.projectId, a.projectId), eq(t.key, a.key))).limit(1);
    const [title, sortOrder] = TITLES[a.key]!;
    if (ex) {
      if (ex.edited === 1 && !a.fromUser)
        fail("This section was edited by the user. Ask before overwriting it.", { errorCode: "user_edited", statusCode: 409 });
      await db.update(t).set({ content: a.content, edited: a.fromUser ? 1 : 0, updatedAt: new Date().toISOString() }).where(eq(t.id, ex.id));
    } else {
      await db.insert(t).values({ id: crypto.randomUUID(), projectId: a.projectId, key: a.key, title, content: a.content, edited: a.fromUser ? 1 : 0, sortOrder, ownerEmail: owner });
    }
    return { key: a.key, edited: a.fromUser };
  },
});
