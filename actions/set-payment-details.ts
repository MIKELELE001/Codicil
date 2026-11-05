import { defineAction, fail } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { DEFAULT_OWNER, loadProject } from "../server/lib/project-data.js";

export default defineAction({
  description:
    "Set how the freelancer gets paid on a project: deposit percent, currency (USD, USDC...), network (e.g. Base, blank for bank/fiat), payment reference (wallet address or payment note) and payment terms. These appear read-only on the client's agreement link. Also the payer's name, how they pay, and days until an invoice is due. Only change fields the user mentioned.",
  schema: z.object({
    projectId: z.string(),
    depositPercent: z.coerce.number().int().min(0).max(100).optional(),
    paymentCurrency: z.string().min(1).max(12).optional(),
    paymentNetwork: z.string().max(40).optional(),
    paymentReference: z.string().max(200).optional(),
    paymentTerms: z.string().max(600).optional(),
    payerName: z.string().max(120).optional().describe("Legal or paying entity name the money will come from; shown on the agreement so fintech accounts can match payments"),
    paymentRail: z.string().max(40).optional().describe("How the client pays: ACH, SWIFT, Payoneer, USDT-TRC20, USDC-Base ..."),
    paymentDueDays: z.coerce.number().int().min(0).max(180).optional().describe("Days after an invoice is issued before it is due; default 14"),
  }),
  outputSchema: z.object({ ok: z.boolean() }),
  run: async ({ projectId, ...rest }, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const p = await loadProject(projectId, owner);
    if (!p) fail("Project not found.", { errorCode: "not_found", statusCode: 404 });
    const set = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
    if (Object.keys(set).length) await getDb().update(schema.projects).set(set).where(eq(schema.projects.id, projectId));
    return { ok: true };
  },
});
