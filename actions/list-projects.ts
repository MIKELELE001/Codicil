import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { DEFAULT_OWNER } from "../server/lib/project-data.js";

export default defineAction({
  description: "List all projects with status, version, agreed total, pending change count and unpaid amount, for the dashboard. Amounts in USD cents.",
  schema: z.object({}),
  outputSchema: z.object({
    projects: z.array(z.object({
      id: z.string(), title: z.string(), clientName: z.string(), status: z.string(), currentVersion: z.number(),
      agreedTotalCents: z.number(), pendingChanges: z.number(), outstandingCents: z.number(), overdueCents: z.number(),
    })),
    overdueCents: z.number(),
    outstandingCents: z.number(),
    pendingChanges: z.number(),
    caughtCents: z.number(),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (_a, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const db = getDb();
    const ps = await db.select().from(schema.projects).where(eq(schema.projects.ownerEmail, owner)).orderBy(schema.projects.createdAt).limit(200);
    const cos = await db.select().from(schema.changeOrders).where(eq(schema.changeOrders.ownerEmail, owner)).limit(2000);
    const vs = await db.select().from(schema.scopeVersions).where(eq(schema.scopeVersions.ownerEmail, owner)).limit(2000);
    const invs = await db.select().from(schema.invoices).where(eq(schema.invoices.ownerEmail, owner)).limit(2000);
    const out = ps.map((p) => {
      const v = vs.find((x) => x.projectId === p.id && x.version === p.currentVersion);
      const outstanding = invs.filter((i) => i.projectId === p.id && i.status !== "paid").reduce((s, i) => s + i.amountCents, 0);
      return {
        id: p.id, title: p.title, clientName: p.clientName, status: p.status, currentVersion: p.currentVersion,
        agreedTotalCents: v?.totalCents ?? 0, pendingChanges: cos.filter((c) => c.projectId === p.id && c.status === "pending").length,
        outstandingCents: outstanding,
        overdueCents: invs.filter((i) => i.projectId === p.id && i.status !== "paid" && !!i.dueAt && new Date(i.dueAt).getTime() < Date.now()).reduce((s, i) => s + i.amountCents, 0),
      };
    });
    return {
      projects: out,
      outstandingCents: out.reduce((s, p) => s + p.outstandingCents, 0),
      overdueCents: out.reduce((s, p) => s + p.overdueCents, 0),
      pendingChanges: out.reduce((s, p) => s + p.pendingChanges, 0),
      caughtCents: cos.filter((c) => c.status === "approved" && c.deltaCents > 0).reduce((s, c) => s + c.deltaCents, 0),
    };
  },
});
