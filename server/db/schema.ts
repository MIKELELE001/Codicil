import { sql } from "drizzle-orm";
import { doublePrecision, integer, pgTable, text } from "drizzle-orm/pg-core";

// Money is stored as integer cents (USD). Never floats.

/** The freelancer's rate card: one row per service they sell. */
export const rateItems = pgTable("rate_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(), // e.g. "Website page design"
  unit: text("unit").notNull(), // e.g. "page", "hour", "item"
  rateCents: integer("rate_cents").notNull(),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

/** One client engagement, from first brief to completed. */
export const projects = pgTable("projects", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  clientName: text("client_name").notNull(),
  brief: text("brief").notNull().default(""),
  status: text("status", {
    enum: [
      "new_inquiry",
      "awaiting_clarification",
      "proposal_drafted",
      "proposal_sent",
      "approved",
      "in_progress",
      "invoice_pending",
      "completed",
    ],
  })
    .notNull()
    .default("new_inquiry"),
  scopeIncluded: text("scope_included").notNull().default(""),
  scopeExcluded: text("scope_excluded").notNull().default(""),
  revisionsIncluded: integer("revisions_included").notNull().default(2),
  currentVersion: integer("current_version").notNull().default(0), // 0 = scope not locked yet
  depositPercent: integer("deposit_percent").notNull().default(50),
  paymentCurrency: text("payment_currency").notNull().default("USD"), // USD, USDC, ...
  paymentNetwork: text("payment_network").notNull().default(""), // e.g. Base; blank for fiat
  paymentReference: text("payment_reference").notNull().default(""), // bank note or wallet address
  paymentTerms: text("payment_terms").notNull().default("Deposit due on approval; balance due on delivery."),
  agreementToken: text("agreement_token"),
  agreementStatus: text("agreement_status", { enum: ["none", "sent", "accepted"] }).notNull().default("none"),
  agreementExpiresAt: text("agreement_expires_at"),
  payerName: text("payer_name").notNull().default(""), // legal or paying entity, for fintech compliance checks
  paymentRail: text("payment_rail").notNull().default(""), // e.g. ACH, SWIFT, Payoneer, USDT-TRC20, USDC-Base
  paymentDueDays: integer("payment_due_days").notNull().default(14),
  revisionsUsed: integer("revisions_used").notNull().default(0),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

/** A priced line in the scope. Price comes from the rate card, not the AI. */
export const scopeItems = pgTable("scope_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  rateItemId: text("rate_item_id"),
  label: text("label").notNull(),
  unit: text("unit").notNull(),
  quantity: doublePrecision("quantity").notNull().default(1),
  rateCents: integer("rate_cents").notNull(), // snapshot used for this line
  rateOverridden: integer("rate_overridden").notNull().default(0), // 1 = user set a custom rate
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

/** Immutable snapshot of the agreed scope. v1 = original agreement. */
export const scopeVersions = pgTable("scope_versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  version: integer("version").notNull(),
  totalCents: integer("total_cents").notNull(),
  linesJson: text("lines_json").notNull(),
  reason: text("reason").notNull().default(""),
  changeOrderId: text("change_order_id"),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

/** A client request analysed against the locked scope. */
export const changeOrders = pgTable("change_orders", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  baseVersion: integer("base_version").notNull(),
  classification: text("classification", { enum: ["included", "unclear", "additional"] }).notNull(),
  status: text("status", { enum: ["noted", "pending", "approved", "rejected"] }).notNull(),
  summary: text("summary").notNull(),
  evidence: text("evidence").notNull().default(""),
  sourceMessage: text("source_message").notNull().default(""),
  clientReplyDraft: text("client_reply_draft").notNull().default(""),
  timelineDeltaDays: integer("timeline_delta_days").notNull().default(0),
  deltaCents: integer("delta_cents").notNull().default(0),
  decisionNote: text("decision_note").notNull().default(""),
  clientToken: text("client_token"),
  clientStatus: text("client_status", { enum: ["none", "sent", "accepted", "declined"] }).notNull().default("none"),
  clientComment: text("client_comment").notNull().default(""),
  clientRespondedAt: text("client_responded_at"),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
  decidedAt: text("decided_at"),
});

export const changeOrderItems = pgTable("change_order_items", {
  id: text("id").primaryKey(),
  changeOrderId: text("change_order_id").notNull(),
  op: text("op", { enum: ["add", "update", "remove"] }).notNull(),
  scopeItemId: text("scope_item_id"),
  rateItemId: text("rate_item_id"),
  label: text("label").notNull(),
  unit: text("unit").notNull(),
  quantity: doublePrecision("quantity").notNull().default(1),
  rateCents: integer("rate_cents").notNull(),
  rateOverridden: integer("rate_overridden").notNull().default(0),
  ownerEmail: text("owner_email").notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind").notNull(),
  detail: text("detail").notNull().default(""),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
});

/** Editable proposal prose. Price breakdown is computed from scope, never stored here. */
export const proposalSections = pgTable("proposal_sections", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  key: text("key").notNull(), // overview | scope | timeline | payment | terms
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  edited: integer("edited").notNull().default(0), // 1 = user edited by hand
  sortOrder: integer("sort_order").notNull().default(0),
  ownerEmail: text("owner_email").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`now()`),
});

export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  number: text("number").notNull(),
  kind: text("kind", { enum: ["deposit", "balance", "adjustment", "full"] }).notNull(),
  label: text("label").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: text("status", { enum: ["draft", "sent", "paid"] }).notNull().default("draft"),
  txHash: text("tx_hash").notNull().default(""),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull().default(sql`now()`),
  paidAt: text("paid_at"),
  dueAt: text("due_at"),
});

/** Typed-name acceptance records. No personal details are collected, only what the signer chooses to type. */
export const agreementAcceptances = pgTable("agreement_acceptances", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  kind: text("kind", { enum: ["agreement", "change"] }).notNull(),
  version: integer("version").notNull(),
  changeOrderId: text("change_order_id"),
  signerName: text("signer_name").notNull(),
  note: text("note").notNull().default(""),
  contentHash: text("content_hash").notNull(),
  consentText: text("consent_text").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  ownerEmail: text("owner_email").notNull(),
  acceptedAt: text("accepted_at").notNull().default(sql`now()`),
});
