import { eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import { ChangeError } from "./apply-change.js";
import { priceLine, totalCents } from "./pricing.js";
import { audit, loadLines, loadProject } from "./project-data.js";

type Db = ReturnType<typeof getDb>;

/** Lock the scope as agreed version 1. Single implementation used by the freelancer and by client acceptance. */
export async function lockScopeV1(projectId: string, owner: string, actor: "freelancer" | "client", extra?: (tx: Db) => Promise<void>) {
  const p = await loadProject(projectId, owner);
  if (!p) throw new ChangeError("not_found", "Project not found.", 404);
  if (p.currentVersion > 0) throw new ChangeError("already_locked", "Scope is already locked.");
  const lines = (await loadLines(projectId)).map(priceLine);
  if (!lines.length) throw new ChangeError("empty_scope", "Add at least one scope line before locking.", 400);
  const total = totalCents(lines);
  await getDb().transaction(async (tx) => {
    await tx.insert(schema.scopeVersions).values({
      id: crypto.randomUUID(), projectId, version: 1, totalCents: total, linesJson: JSON.stringify(lines),
      reason: "Original agreement", ownerEmail: owner,
    });
    await tx.update(schema.projects).set({ currentVersion: 1, status: "approved" }).where(eq(schema.projects.id, projectId));
    await audit(projectId, owner, "scope_locked", `v1 locked at ${total} cents by ${actor}`, tx as never);
    if (extra) await extra(tx as never);
  });
  return { version: 1, totalCents: total };
}
