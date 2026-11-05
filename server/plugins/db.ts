import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "freelancer-office-core",
      sql: `CREATE TABLE IF NOT EXISTS rate_items (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  rate_cents INTEGER NOT NULL CHECK (rate_cents >= 0),
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  client_name TEXT NOT NULL,
  brief TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new_inquiry',
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE TABLE IF NOT EXISTS scope_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  rate_item_id TEXT,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1 CHECK (quantity > 0),
  rate_cents INTEGER NOT NULL CHECK (rate_cents >= 0),
  rate_overridden INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS rate_items_owner_idx ON rate_items (owner_email, name);
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects (owner_email, created_at);
CREATE INDEX IF NOT EXISTS scope_items_project_idx ON scope_items (project_id, created_at)`,
    },
    {
      version: 2,
      name: "change-orders-and-versions",
      sql: `ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_included TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS scope_excluded TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS revisions_included INTEGER NOT NULL DEFAULT 2;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS current_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS scope_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  version INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  lines_json TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  change_order_id TEXT,
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now()),
  UNIQUE (project_id, version)
);
CREATE TABLE IF NOT EXISTS change_orders (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  base_version INTEGER NOT NULL,
  classification TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  evidence TEXT NOT NULL DEFAULT '',
  source_message TEXT NOT NULL DEFAULT '',
  client_reply_draft TEXT NOT NULL DEFAULT '',
  timeline_delta_days INTEGER NOT NULL DEFAULT 0,
  delta_cents INTEGER NOT NULL DEFAULT 0,
  decision_note TEXT NOT NULL DEFAULT '',
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now()),
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS change_order_items (
  id TEXT PRIMARY KEY,
  change_order_id TEXT NOT NULL REFERENCES change_orders(id),
  op TEXT NOT NULL,
  scope_item_id TEXT,
  rate_item_id TEXT,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  quantity DOUBLE PRECISION NOT NULL DEFAULT 1,
  rate_cents INTEGER NOT NULL,
  rate_overridden INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS change_orders_project_idx ON change_orders (project_id, created_at);
CREATE INDEX IF NOT EXISTS change_order_items_co_idx ON change_order_items (change_order_id);
CREATE INDEX IF NOT EXISTS audit_events_project_idx ON audit_events (project_id, created_at)`,
    },
    {
      version: 3,
      name: "proposal-and-invoices",
      sql: `ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_percent INTEGER NOT NULL DEFAULT 50;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_currency TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_network TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_reference TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_terms TEXT NOT NULL DEFAULT 'Deposit due on approval; balance due on delivery.';
CREATE TABLE IF NOT EXISTS proposal_sections (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  edited INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  owner_email TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (now()),
  UNIQUE (project_id, key)
);
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  number TEXT NOT NULL,
  kind TEXT NOT NULL,
  label TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  tx_hash TEXT NOT NULL DEFAULT '',
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (now()),
  paid_at TEXT
);
CREATE INDEX IF NOT EXISTS invoices_project_idx ON invoices (project_id, created_at)`,
    },
    {
      version: 4,
      name: "client-approval-link",
      sql: `ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_token TEXT;
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_comment TEXT NOT NULL DEFAULT '';
ALTER TABLE change_orders ADD COLUMN IF NOT EXISTS client_responded_at TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS change_orders_token_idx ON change_orders (client_token)`,
    },
    {
      version: 5,
      name: "living-agreement-link",
      sql: `ALTER TABLE projects ADD COLUMN IF NOT EXISTS agreement_token TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS agreement_status TEXT NOT NULL DEFAULT 'none';
CREATE UNIQUE INDEX IF NOT EXISTS projects_agreement_token_idx ON projects (agreement_token);
CREATE TABLE IF NOT EXISTS agreement_acceptances (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  kind TEXT NOT NULL,
  version INTEGER NOT NULL,
  change_order_id TEXT,
  signer_name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (now())
);
CREATE INDEX IF NOT EXISTS agreement_acceptances_project_idx ON agreement_acceptances (project_id, accepted_at)`,
    },
    {
      version: 6,
      name: "expiry-and-revision-counter",
      sql: `ALTER TABLE projects ADD COLUMN IF NOT EXISTS agreement_expires_at TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS revisions_used INTEGER NOT NULL DEFAULT 0`,
    },
    {
      version: 7,
      name: "consent-due-dates-payer",
      sql: `ALTER TABLE projects ADD COLUMN IF NOT EXISTS payer_name TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_rail TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_due_days INTEGER NOT NULL DEFAULT 14;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_at TEXT;
ALTER TABLE agreement_acceptances ADD COLUMN IF NOT EXISTS consent_text TEXT NOT NULL DEFAULT '';
ALTER TABLE agreement_acceptances ADD COLUMN IF NOT EXISTS user_agent TEXT NOT NULL DEFAULT ''`,
    },
  ],
  { table: "freelancer_office_migrations" },
);
