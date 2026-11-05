import { eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { loadChange } from "./change-load.js";
import { reconcileInvoices } from "./invoices.js";
import { priceLine, totalCents } from "./pricing.js";
import { audit, loadLines, loadProject } from "./project-data.js";

export class ChangeError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message);
  }
}

/** The single place a change order is applied. Transactional and safe to retry. */
export async function applyChangeOrder(id: string, owner: string, note: string, actor: "freelancer" | "client") {
  const c = await loadChange(id, owner);
  if (!c) throw new ChangeError("not_found", "Change order not found.", 404);
  if (c.co.status !== "pending") throw new ChangeError("already_decided", `Already ${c.co.status}.`);
  const p = await loadProject(c.co.projectId, owner);
  if (!p) throw new ChangeError("not_found", "Project not found.", 404);
  if (p.currentVersion !== c.co.baseVersion)
    throw new ChangeError("stale_version", "Scope changed since this was proposed. Re-propose it.");

  return await getDb().transaction(async (tx) => {
    const s = schema.scopeItems;
    for (const it of c.items) {
      if (it.op === "remove") await tx.delete(s).where(eq(s.id, it.scopeItemId!));
      else if (it.op === "update")
        await tx.update(s).set({ label: it.label, quantity: it.quantity, rateCents: it.rateCents, rateOverridden: it.overridden }).where(eq(s.id, it.scopeItemId!));
      else
        await tx.insert(s).values({
          id: it.newId!, projectId: p.id, rateItemId: it.rateItemId, label: it.label, unit: it.unit,
          quantity: it.quantity, rateCents: it.rateCents, rateOverridden: it.overridden, ownerEmail: owner,
        });
    }
    const lines = (await loadLines(p.id)).map(priceLine);
    const total = totalCents(lines);
    const version = p.currentVersion + 1;
    await tx.insert(schema.scopeVersions).values({
      id: crypto.randomUUID(), projectId: p.id, version, totalCents: total, linesJson: JSON.stringify(lines),
      reason: c.co.summary, changeOrderId: id, ownerEmail: owner,
    });
    await tx.update(schema.projects).set({ currentVersion: version, status: "proposal_drafted" }).where(eq(schema.projects.id, p.id));
    await tx.update(schema.changeOrders).set({ status: "approved", decisionNote: note, decidedAt: new Date().toISOString() }).where(eq(schema.changeOrders.id, id));
    await reconcileInvoices(tx as never, p.id, owner, c.co.deltaCents, `v${version}`);
    await audit(p.id, owner, "change_approved", `v${version} by ${actor}: ${c.co.summary} (${c.co.deltaCents >= 0 ? "+" : ""}${c.co.deltaCents} cents)`, tx as never);
    return { version, totalCents: total, deltaCents: c.co.deltaCents };
  });
}
