import { and, eq } from "drizzle-orm";

import { getDb, schema } from "../db/index.js";
import type { Line } from "./changes.js";

export const DEFAULT_OWNER = "local@localhost";

export async function loadProject(id: string, owner: string) {
  const [p] = await getDb()
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.ownerEmail, owner)))
    .limit(1);
  return p;
}

export async function loadLines(projectId: string): Promise<Line[]> {
  const rows = await getDb()
    .select()
    .from(schema.scopeItems)
    .where(eq(schema.scopeItems.projectId, projectId))
    .orderBy(schema.scopeItems.createdAt)
    .limit(200);
  return rows.map((r) => ({ id: r.id, label: r.label, unit: r.unit, quantity: r.quantity, rateCents: r.rateCents }));
}

export async function audit(projectId: string, owner: string, kind: string, detail: string, tx = getDb()) {
  await tx.insert(schema.auditEvents).values({ id: crypto.randomUUID(), projectId, kind, detail, ownerEmail: owner });
}
