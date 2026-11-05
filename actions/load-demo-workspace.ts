import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { priceLine, totalCents } from "../server/lib/pricing.js";
import { audit, DEFAULT_OWNER } from "../server/lib/project-data.js";

const DEMO_TITLE = "Acme Studio website (demo)";
const SAMPLE_CLIENT_MESSAGE =
  "Love the direction! Can you also add a blog and make the logo animated? Should be quick 🙏";

export default defineAction({
  description:
    "Load a ready-made demo: a sample rate card, an approved $850 five-page website project with locked scope (v1), a deposit/balance invoice schedule with the deposit paid, and a sample client message to paste. Safe to run more than once; it never duplicates the demo project.",
  schema: z.object({}),
  outputSchema: z.object({ projectId: z.string(), created: z.boolean(), sampleClientMessage: z.string() }),
  run: async (_a, ctx) => {
    const owner = ctx?.userEmail ?? DEFAULT_OWNER;
    const db = getDb();
    const [existing] = await db.select().from(schema.projects)
      .where(and(eq(schema.projects.ownerEmail, owner), eq(schema.projects.title, DEMO_TITLE))).limit(1);
    if (existing) return { projectId: existing.id, created: false, sampleClientMessage: SAMPLE_CLIENT_MESSAGE };

    const rate = (name: string, unit: string, usd: number) => ({
      id: crypto.randomUUID(), name, unit, rateCents: usd * 100, ownerEmail: owner,
    });
    const existingRates = await db.select().from(schema.rateItems).where(eq(schema.rateItems.ownerEmail, owner)).limit(200);
    const need = [
      rate("Web page design", "page", 130), rate("Contact form setup", "item", 200),
      rate("Blog setup", "item", 300), rate("Logo animation", "item", 120),
      rate("Extra revision round", "round", 60),
    ].filter((r) => !existingRates.some((e) => e.name === r.name));
    const byName = (n: string) => (existingRates.find((e) => e.name === n) ?? need.find((r) => r.name === n))!;

    const projectId = crypto.randomUUID();
    const mk = (n: string, qty: number, label: string) => {
      const r = byName(n);
      return { id: crypto.randomUUID(), projectId, rateItemId: r.id, label, unit: r.unit, quantity: qty, rateCents: r.rateCents, rateOverridden: 0, ownerEmail: owner };
    };
    const items = [mk("Web page design", 5, "Website pages (5)"), mk("Contact form setup", 1, "Contact form")];
    const lines = items.map((i) => priceLine({ id: i.id, label: i.label, unit: i.unit, quantity: i.quantity, rateCents: i.rateCents }));
    const total = totalCents(lines); // 5 x $130 + $200 = $850
    const deposit = Math.round(total / 2);
    await db.transaction(async (tx) => {
      if (need.length) await tx.insert(schema.rateItems).values(need);
      await tx.insert(schema.projects).values({
        id: projectId, title: DEMO_TITLE, clientName: "Acme Studio", ownerEmail: owner, status: "invoice_pending", currentVersion: 1,
        brief: "Acme Studio needs a clean five-page marketing website with a contact form. Launch in two weeks.",
        scopeIncluded: "Five responsive pages, contact form, two revision rounds.",
        scopeExcluded: "Blog, logo design or animation, copywriting, hosting, extra pages, third-party integrations.",
        revisionsIncluded: 2, paymentCurrency: "USD",
      });
      await tx.insert(schema.scopeItems).values(items);
      await tx.insert(schema.scopeVersions).values({
        id: crypto.randomUUID(), projectId, version: 1, totalCents: total, linesJson: JSON.stringify(lines), reason: "Original agreement", ownerEmail: owner,
      });
      await tx.insert(schema.invoices).values([
        { id: crypto.randomUUID(), projectId, number: "INV-DEMO-A", kind: "deposit", label: "Deposit (50%)", amountCents: deposit, status: "paid", paidAt: new Date().toISOString(), ownerEmail: owner },
        { id: crypto.randomUUID(), projectId, number: "INV-DEMO-B", kind: "balance", label: "Balance", amountCents: total - deposit, status: "draft", ownerEmail: owner },
      ]);
      await tx.insert(schema.proposalSections).values([
        { id: crypto.randomUUID(), projectId, key: "overview", title: "Project overview", content: "A clean, responsive five-page marketing website for Acme Studio, with a working contact form.", sortOrder: 0, ownerEmail: owner },
        { id: crypto.randomUUID(), projectId, key: "timeline", title: "Timeline", content: "Two weeks from deposit to launch.", sortOrder: 2, ownerEmail: owner },
        { id: crypto.randomUUID(), projectId, key: "terms", title: "Conditions", content: "Two revision rounds are included. Work outside the agreed scope is quoted as a change order and starts only after you approve it.", sortOrder: 4, ownerEmail: owner },
      ]);
      await audit(projectId, owner, "scope_locked", `demo v1 locked at ${total} cents`, tx as never);
    });
    return { projectId, created: true, sampleClientMessage: SAMPLE_CLIENT_MESSAGE };
  },
});
