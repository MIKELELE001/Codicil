import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Create a client project from a pasted brief. Stores the raw brief and starts the project at status new_inquiry. Add priced scope lines afterwards with save-scope-item.",
  schema: z.object({
    title: z.string().min(1).describe('Project title, e.g. "5-page business website"'),
    clientName: z.string().min(1).describe("Client or company name"),
    brief: z.string().default("").describe("Raw client brief, message or notes; empty string if none"),
  }),
  outputSchema: z.object({ id: z.string(), title: z.string(), status: z.string() }),
  run: async (args, ctx) => {
    const owner = ctx?.userEmail ?? "local@localhost";
    const id = crypto.randomUUID();
    await getDb().insert(schema.projects).values({
      id,
      title: args.title,
      clientName: args.clientName,
      brief: args.brief,
      ownerEmail: owner,
    });
    return { id, title: args.title, status: "new_inquiry" };
  },
});
