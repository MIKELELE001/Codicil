import { eq } from "drizzle-orm";
import { createError, defineEventHandler, getHeader, getRouterParam, readBody } from "h3";

import { getDb, schema } from "../../../db/index.js";
import { cleanSignerName, latestSharedChange, projectByAgreementToken, recordAcceptance } from "../../../lib/agreement.js";
import { applyChangeOrder, ChangeError } from "../../../lib/apply-change.js";
import { lockScopeV1 } from "../../../lib/lock.js";
import { audit } from "../../../lib/project-data.js";

/** Public, token-gated. type: "accept_agreement" | "respond_change". The client only types a name. */
export default defineEventHandler(async (event) => {
  const p = await projectByAgreementToken(getRouterParam(event, "token") ?? "");
  if (!p) throw createError({ statusCode: 404, statusMessage: "Not found" });
  const body = (await readBody(event)) as { type?: string; signerName?: string; note?: string; decision?: string; consent?: boolean } | undefined;
  const note = String(body?.note ?? "").slice(0, 500);
  const db = getDb();
  const ua = String(getHeader(event, "user-agent") ?? "");
  const needConsent = () => {
    if (body?.consent !== true) throw createError({ statusCode: 400, statusMessage: "Tick the consent box to sign electronically." });
  };
  try {
    if (body?.type === "accept_agreement") {
      const name = cleanSignerName(body.signerName);
      if (!name) throw createError({ statusCode: 400, statusMessage: "Type a name (2 to 60 characters) to sign." });
      needConsent();
      if (p.currentVersion > 0) throw createError({ statusCode: 409, statusMessage: "Already accepted" });
      if (p.agreementExpiresAt && new Date(p.agreementExpiresAt).getTime() < Date.now())
        throw createError({ statusCode: 410, statusMessage: "This proposal has expired. Ask for a fresh link." });
      await lockScopeV1(p.id, p.ownerEmail, "client", async (tx) => {
        await tx.update(schema.projects).set({ agreementStatus: "accepted" }).where(eq(schema.projects.id, p.id));
      });
      const fp = await recordAcceptance(p, "agreement", 1, name, note, undefined, ua);
      await audit(p.id, p.ownerEmail, "agreement_signed", `signed by "${name}"`);
      return { ok: true, version: 1, fingerprint: fp };
    }
    if (body?.type === "respond_change") {
      const co = await latestSharedChange(p.id);
      if (!co) throw createError({ statusCode: 404, statusMessage: "No change waiting" });
      const now = new Date().toISOString();
      if (body.decision === "decline") {
        await db.update(schema.changeOrders).set({ status: "rejected", clientStatus: "declined", clientComment: note, clientRespondedAt: now, decidedAt: now }).where(eq(schema.changeOrders.id, co.id));
        await audit(p.id, p.ownerEmail, "change_declined_by_client", co.summary);
        return { ok: true, clientStatus: "declined" };
      }
      if (body.decision !== "accept") throw createError({ statusCode: 400, statusMessage: "Bad request" });
      needConsent();
      const name = cleanSignerName(body.signerName);
      if (!name) throw createError({ statusCode: 400, statusMessage: "Type a name (2 to 60 characters) to sign." });
      const r = await applyChangeOrder(co.id, p.ownerEmail, "Accepted by client", "client");
      await db.update(schema.changeOrders).set({ clientStatus: "accepted", clientComment: note, clientRespondedAt: now }).where(eq(schema.changeOrders.id, co.id));
      const fp = await recordAcceptance(p, "change", r.version, name, note, co.id, ua);
      return { ok: true, clientStatus: "accepted", version: r.version, fingerprint: fp };
    }
    throw createError({ statusCode: 400, statusMessage: "Bad request" });
  } catch (e) {
    if (e instanceof ChangeError) throw createError({ statusCode: e.status, statusMessage: e.message });
    throw e;
  }
});
