CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE contract_type   AS ENUM ('employee','contractor','agent');
CREATE TYPE location_type   AS ENUM ('india','canada','field');
CREATE TYPE emp_status      AS ENUM ('active','inactive','on_leave');
CREATE TYPE leave_type      AS ENUM ('annual','sick','casual','unpaid');
CREATE TYPE approval_status AS ENUM ('pending','approved','rejected');
CREATE TYPE warning_level   AS ENUM ('verbal','written','final');
CREATE TYPE perf_tier       AS ENUM ('top','mid','poor');
CREATE TYPE currency_type   AS ENUM ('USD','CAD','INR');
CREATE TYPE contact_method  AS ENUM ('call','email','visit','message');
CREATE TYPE sale_outcome    AS ENUM ('no_response','interested','quoted','negotiating','closed','lost');
CREATE TYPE quote_status    AS ENUM ('sent','viewed','countered','accepted','rejected','expired');
CREATE TYPE commission_status AS ENUM ('pending_escrow','earned','paid');
CREATE TYPE shipment_status AS ENUM ('loading','in_transit','at_origin_port','on_vessel','sailing','arrived','delivered');
CREATE TYPE port_type       AS ENUM ('origin','destination');
CREATE TYPE batch_status    AS ENUM ('ordered','in_production','ready_at_mill','dispatched','sgs_failed');
CREATE TYPE sgs_result      AS ENUM ('pass','fail','conditional_pass');
CREATE TYPE agent_task_status AS ENUM ('assigned','contacted_mill','negotiating','confirmed','overdue');
CREATE TYPE po_status       AS ENUM ('draft','pending_approval','approved','sourcing','in_production','complete','cancelled');
CREATE TYPE sourcing_req_status AS ENUM ('sent_to_partner','agent_assigned','steel_secured','failed');
CREATE TYPE doc_type        AS ENUM ('bill_of_lading','customs_declaration','certificate_of_origin','certificate_of_conformity','sgs_report','government_cert','insurance_policy','invoice','other');
CREATE TYPE doc_status      AS ENUM ('draft','submitted','approved','rejected','expired');
CREATE TYPE escrow_status   AS ENUM ('not_opened','open','delivery_confirmed','signed','disputed');
CREATE TYPE invoice_type    AS ENUM ('supplier','port_charge','customs','insurance','contractor_commission');
CREATE TYPE invoice_status  AS ENUM ('pending_approval','approved','paid','disputed');
CREATE TYPE ledger_type     AS ENUM ('india','canada');
CREATE TYPE policy_type     AS ENUM ('DDU','all_risk','marine_cargo');
CREATE TYPE policy_status   AS ENUM ('quote_requested','issued','active','claimed','closed');
CREATE TYPE claim_status    AS ENUM ('filed','under_review','settled','rejected');

CREATE TABLE departments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(60)  UNIQUE NOT NULL,
  module_key      VARCHAR(30)  NOT NULL,
  headcount_target INTEGER     DEFAULT 0,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(60)  UNIQUE NOT NULL,
  department_id   UUID         REFERENCES departments(id),
  access_level    VARCHAR(30)  NOT NULL DEFAULT 'employee',
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE employees (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code   VARCHAR(20)  UNIQUE NOT NULL,
  full_name       VARCHAR(120) NOT NULL,
  email           VARCHAR(120) UNIQUE NOT NULL,
  phone           VARCHAR(20),
  role_id         UUID         REFERENCES roles(id),
  department_id   UUID         REFERENCES departments(id),
  manager_id      UUID         REFERENCES employees(id),
  contract_type   contract_type NOT NULL DEFAULT 'employee',
  location        location_type NOT NULL DEFAULT 'india',
  status          emp_status   NOT NULL DEFAULT 'active',
  join_date       DATE         NOT NULL,
  contract_end_date DATE,
  hashed_password VARCHAR(255) NOT NULL,
  last_active_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ  DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_emp_dept_status ON employees(department_id, status);
CREATE INDEX idx_emp_last_active ON employees(last_active_at);

CREATE TABLE task_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID         NOT NULL REFERENCES employees(id),
  module      VARCHAR(30)  NOT NULL,
  title       VARCHAR(200) NOT NULL,
  detail      TEXT,
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN ('done','in_progress','pending','overdue')),
  ref_id      UUID,
  ref_type    VARCHAR(40),
  logged_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  due_date    DATE,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_task_emp_date ON task_logs(employee_id, logged_at);

CREATE TABLE attendance (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID    NOT NULL REFERENCES employees(id),
  date        DATE    NOT NULL,
  check_in    TIMESTAMPTZ,
  check_out   TIMESTAMPTZ,
  status      VARCHAR(20) NOT NULL DEFAULT 'present' CHECK (status IN ('present','absent','half_day','on_leave')),
  notes       TEXT,
  UNIQUE(employee_id, date)
);

CREATE TABLE leave_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID         NOT NULL REFERENCES employees(id),
  leave_type  leave_type   NOT NULL,
  start_date  DATE         NOT NULL,
  end_date    DATE         NOT NULL,
  reason      TEXT,
  status      approval_status NOT NULL DEFAULT 'pending',
  approved_by UUID         REFERENCES employees(id),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE warnings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID         NOT NULL REFERENCES employees(id),
  issued_by       UUID         NOT NULL REFERENCES employees(id),
  level           warning_level NOT NULL,
  reason          TEXT         NOT NULL,
  evidence_url    VARCHAR(500),
  issued_at       TIMESTAMPTZ  DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ
);

CREATE TABLE onboarding_checklists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID    NOT NULL REFERENCES employees(id),
  item        VARCHAR(200) NOT NULL,
  completed   BOOLEAN  DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  due_by      DATE
);

CREATE TABLE performance_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID        NOT NULL REFERENCES employees(id),
  week_start      DATE        NOT NULL,
  module          VARCHAR(30) NOT NULL,
  raw_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
  rank_in_dept    INTEGER,
  tier            perf_tier,
  kpi_breakdown   JSONB       NOT NULL DEFAULT '{}',
  calculated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(employee_id, week_start, module)
);

CREATE INDEX idx_perf_emp_week  ON performance_scores(employee_id, week_start);
CREATE INDEX idx_perf_week_tier ON performance_scores(week_start, tier);

-- SALES
CREATE TABLE clients (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name              VARCHAR(150) NOT NULL,
  contact_name              VARCHAR(100),
  contact_email             VARCHAR(120),
  contact_phone             VARCHAR(20),
  country                   VARCHAR(30)  NOT NULL DEFAULT 'canada',
  industry                  VARCHAR(80),
  assigned_to               UUID         REFERENCES employees(id),
  status                    VARCHAR(20)  NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','active','inactive','lost')),
  steel_grades_interest     TEXT[],
  est_monthly_volume_tonnes NUMERIC(10,2),
  created_at                TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE sales_activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id   UUID           NOT NULL REFERENCES employees(id),
  client_id       UUID           NOT NULL REFERENCES clients(id),
  contact_method  contact_method NOT NULL,
  outcome         sale_outcome   NOT NULL DEFAULT 'no_response',
  notes           TEXT,
  follow_up_date  DATE,
  logged_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  week_start      DATE           NOT NULL
);

CREATE INDEX idx_sal_contractor_week ON sales_activity_log(contractor_id, week_start);

CREATE TABLE quotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number    VARCHAR(30)  UNIQUE NOT NULL,
  contractor_id   UUID         NOT NULL REFERENCES employees(id),
  client_id       UUID         NOT NULL REFERENCES clients(id),
  steel_grade     VARCHAR(60)  NOT NULL,
  quantity_tonnes NUMERIC(10,2) NOT NULL,
  price_per_tonne NUMERIC(12,2) NOT NULL,
  currency        currency_type NOT NULL DEFAULT 'USD',
  valid_until     DATE         NOT NULL,
  status          quote_status NOT NULL DEFAULT 'sent',
  linked_po_id    UUID,
  created_at      TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE commissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id   UUID              NOT NULL REFERENCES employees(id),
  quote_id        UUID              NOT NULL REFERENCES quotes(id),
  escrow_id       UUID,
  amount          NUMERIC(12,2)     NOT NULL,
  currency        currency_type     NOT NULL DEFAULT 'USD',
  status          commission_status NOT NULL DEFAULT 'pending_escrow',
  earned_at       TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ
);

-- LOGISTICS
CREATE TABLE shipments (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_code           VARCHAR(30)     UNIQUE NOT NULL,
  po_id                   UUID,
  batch_id                UUID,
  escrow_id               UUID,
  status                  shipment_status NOT NULL DEFAULT 'loading',
  origin_port             VARCHAR(80)     NOT NULL,
  destination_port        VARCHAR(80)     NOT NULL,
  container_number        VARCHAR(30),
  seal_number             VARCHAR(30),
  weight_ordered_tonnes   NUMERIC(10,2)   NOT NULL,
  weight_loaded_tonnes    NUMERIC(10,2),
  etd                     DATE,
  atd                     DATE,
  eta                     DATE,
  ata                     DATE,
  delivery_confirmed_at   TIMESTAMPTZ,
  created_at              TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX idx_ship_status_eta ON shipments(status, eta);

CREATE TABLE vessels (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                VARCHAR(100) NOT NULL,
  imo_number          VARCHAR(20)  UNIQUE,
  shipping_line       VARCHAR(80),
  voyage_number       VARCHAR(30),
  shipment_id         UUID         REFERENCES shipments(id),
  scheduled_departure TIMESTAMPTZ,
  actual_departure    TIMESTAMPTZ,
  scheduled_arrival   TIMESTAMPTZ,
  actual_arrival      TIMESTAMPTZ
);

CREATE TABLE loading_jobs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id             UUID    NOT NULL REFERENCES shipments(id),
  crew_ids                UUID[]  NOT NULL DEFAULT '{}',
  foreman_id              UUID    REFERENCES employees(id),
  excavator_operator      VARCHAR(100),
  sea_can_number          VARCHAR(30),
  start_time              TIMESTAMPTZ NOT NULL,
  end_time                TIMESTAMPTZ,
  duration_hours          NUMERIC(4,2),
  weight_loaded_tonnes    NUMERIC(10,2),
  photo_urls              TEXT[],
  incidents               TEXT,
  status                  VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','complete'))
);

CREATE TABLE port_charges (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id             UUID      NOT NULL REFERENCES shipments(id),
  port_name               VARCHAR(80) NOT NULL,
  port_type               port_type   NOT NULL DEFAULT 'destination',
  unload_start            TIMESTAMPTZ NOT NULL,
  unload_end              TIMESTAMPTZ,
  hours_billed            NUMERIC(5,2),
  rate_per_hour           NUMERIC(10,2) NOT NULL,
  total_charge            NUMERIC(12,2),
  currency                currency_type NOT NULL DEFAULT 'USD',
  overtime_hours          NUMERIC(4,2)  DEFAULT 0,
  invoice_sent_to_finance BOOLEAN       DEFAULT FALSE,
  warned_hour7            BOOLEAN       DEFAULT FALSE
);

-- MANUFACTURING
CREATE TABLE mills (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(150) NOT NULL,
  city                  VARCHAR(80),
  state                 VARCHAR(80),
  country               VARCHAR(60)  DEFAULT 'India',
  registration_number   VARCHAR(60),
  steel_grades          TEXT[],
  typical_batch_tonnes  NUMERIC(10,2),
  lead_time_days        INTEGER,
  contact_name          VARCHAR(100),
  contact_email         VARCHAR(120),
  contact_phone         VARCHAR(20),
  quality_score         NUMERIC(4,2) DEFAULT 90,
  is_flagged            BOOLEAN      DEFAULT FALSE,
  flag_reason           TEXT,
  created_at            TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE sourcing_agents (
  id                        UUID PRIMARY KEY REFERENCES employees(id),
  region                    VARCHAR(80),
  mill_ids                  UUID[],
  specialised_grades        TEXT[],
  total_tonnes_this_month   NUMERIC(10,2) DEFAULT 0,
  sgs_pass_rate             NUMERIC(5,2)  DEFAULT 100,
  avg_task_turnaround_days  NUMERIC(4,2)  DEFAULT 0
);

CREATE TABLE batches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_code            VARCHAR(30)   UNIQUE NOT NULL,
  mill_id               UUID          NOT NULL REFERENCES mills(id),
  agent_id              UUID          REFERENCES employees(id),
  po_id                 UUID,
  steel_grade           VARCHAR(60)   NOT NULL,
  ordered_tonnes        NUMERIC(10,2) NOT NULL,
  confirmed_tonnes      NUMERIC(10,2),
  status                batch_status  NOT NULL DEFAULT 'ordered',
  promised_ready_date   DATE          NOT NULL,
  actual_ready_date     DATE,
  sgs_status            sgs_result,
  sgs_inspection_id     UUID,
  logistics_notified_at TIMESTAMPTZ,
  created_at            TIMESTAMPTZ   DEFAULT NOW()
);

CREATE TABLE agent_tasks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id              UUID             NOT NULL REFERENCES employees(id),
  assigned_by           UUID             REFERENCES employees(id),
  steel_grade           VARCHAR(60)      NOT NULL,
  quantity_tonnes       NUMERIC(10,2)    NOT NULL,
  target_price_per_tonne NUMERIC(12,2),
  deadline              DATE             NOT NULL,
  status                agent_task_status NOT NULL DEFAULT 'assigned',
  target_mill_id        UUID             REFERENCES mills(id),
  batch_id              UUID             REFERENCES batches(id),
  notes                 TEXT,
  assigned_at           TIMESTAMPTZ      DEFAULT NOW(),
  confirmed_at          TIMESTAMPTZ
);

-- PROCUREMENT
CREATE TABLE purchase_orders (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number               VARCHAR(30)   UNIQUE NOT NULL,
  raised_by               UUID          NOT NULL REFERENCES employees(id),
  approved_by             UUID          REFERENCES employees(id),
  mill_id                 UUID          NOT NULL REFERENCES mills(id),
  steel_grade             VARCHAR(60)   NOT NULL,
  quantity_tonnes         NUMERIC(10,2) NOT NULL,
  quoted_price_per_tonne  NUMERIC(12,2) NOT NULL,
  final_price_per_tonne   NUMERIC(12,2),
  currency                currency_type NOT NULL DEFAULT 'USD',
  ddu_insurance_amount    NUMERIC(12,2),
  required_by_date        DATE          NOT NULL,
  status                  po_status     NOT NULL DEFAULT 'draft',
  linked_deal_id          UUID          REFERENCES quotes(id),
  created_at              TIMESTAMPTZ   DEFAULT NOW(),
  approved_at             TIMESTAMPTZ
);

ALTER TABLE batches ADD CONSTRAINT fk_batch_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id);
ALTER TABLE shipments ADD CONSTRAINT fk_ship_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id);
ALTER TABLE quotes ADD CONSTRAINT fk_quote_po FOREIGN KEY (linked_po_id) REFERENCES purchase_orders(id);

CREATE TABLE sourcing_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id               UUID                  NOT NULL REFERENCES purchase_orders(id),
  sent_to_partner_at  TIMESTAMPTZ,
  agent_id            UUID                  REFERENCES employees(id),
  assigned_at         TIMESTAMPTZ,
  status              sourcing_req_status   NOT NULL DEFAULT 'sent_to_partner',
  failure_reason      TEXT
);

-- PAPERWORK
CREATE TABLE documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type         doc_type     NOT NULL,
  ref_id           UUID         NOT NULL,
  ref_type         VARCHAR(40)  NOT NULL,
  title            VARCHAR(200) NOT NULL,
  file_url         VARCHAR(500) NOT NULL DEFAULT '',
  uploaded_by      UUID         REFERENCES employees(id),
  status           doc_status   NOT NULL DEFAULT 'draft',
  expiry_date      DATE,
  issued_date      DATE,
  issuing_authority VARCHAR(150),
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX idx_doc_expiry ON documents(expiry_date, status) WHERE expiry_date IS NOT NULL;

CREATE TABLE sgs_inspections (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                UUID       NOT NULL REFERENCES batches(id),
  shipment_id             UUID       REFERENCES shipments(id),
  inspector_name          VARCHAR(100),
  inspection_date         DATE       NOT NULL,
  result                  sgs_result NOT NULL,
  certificate_doc_id      UUID       REFERENCES documents(id),
  failure_notes           TEXT,
  re_inspection_required  BOOLEAN    DEFAULT FALSE,
  re_inspection_date      DATE
);

ALTER TABLE batches ADD CONSTRAINT fk_batch_sgs FOREIGN KEY (sgs_inspection_id) REFERENCES sgs_inspections(id);

-- FINANCE
CREATE TABLE escrows (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escrow_code           VARCHAR(30)    UNIQUE NOT NULL,
  shipment_id           UUID           NOT NULL REFERENCES shipments(id),
  client_id             UUID           NOT NULL REFERENCES clients(id),
  value                 NUMERIC(14,2)  NOT NULL,
  currency              currency_type  NOT NULL DEFAULT 'USD',
  provider              VARCHAR(100),
  opened_at             TIMESTAMPTZ,
  delivery_confirmed_at TIMESTAMPTZ,
  signed_at             TIMESTAMPTZ,
  days_outstanding      INTEGER,
  status                escrow_status NOT NULL DEFAULT 'not_opened',
  notes                 TEXT,
  created_at            TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX idx_escrow_status ON escrows(status);

ALTER TABLE shipments ADD CONSTRAINT fk_ship_escrow FOREIGN KEY (escrow_id) REFERENCES escrows(id);
ALTER TABLE commissions ADD CONSTRAINT fk_commission_escrow FOREIGN KEY (escrow_id) REFERENCES escrows(id);

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number  VARCHAR(40)     UNIQUE NOT NULL,
  po_id           UUID            REFERENCES purchase_orders(id),
  shipment_id     UUID            REFERENCES shipments(id),
  invoice_type    invoice_type    NOT NULL,
  amount          NUMERIC(14,2)   NOT NULL,
  currency        currency_type   NOT NULL DEFAULT 'USD',
  ledger          ledger_type     NOT NULL,
  status          invoice_status  NOT NULL DEFAULT 'pending_approval',
  approved_by     UUID            REFERENCES employees(id),
  paid_at         TIMESTAMPTZ,
  document_id     UUID            REFERENCES documents(id),
  created_at      TIMESTAMPTZ     DEFAULT NOW()
);

CREATE TABLE insurance_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_number   VARCHAR(60)    UNIQUE NOT NULL,
  shipment_id     UUID           NOT NULL REFERENCES shipments(id),
  insurer_name    VARCHAR(120)   NOT NULL,
  policy_type     policy_type    NOT NULL DEFAULT 'DDU',
  shipment_value  NUMERIC(14,2)  NOT NULL,
  premium_amount  NUMERIC(12,2),
  currency        currency_type  NOT NULL DEFAULT 'USD',
  coverage_start  DATE           NOT NULL,
  coverage_end    DATE           NOT NULL,
  status          policy_status  NOT NULL DEFAULT 'quote_requested',
  created_at      TIMESTAMPTZ    DEFAULT NOW()
);

CREATE TABLE insurance_claims (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id           UUID          NOT NULL REFERENCES insurance_policies(id),
  shipment_id         UUID          REFERENCES shipments(id),
  claim_value         NUMERIC(14,2) NOT NULL,
  payout_received     NUMERIC(14,2),
  damage_description  TEXT          NOT NULL,
  evidence_doc_ids    UUID[],
  status              claim_status  NOT NULL DEFAULT 'filed',
  filed_at            TIMESTAMPTZ   DEFAULT NOW(),
  settled_at          TIMESTAMPTZ
);

-- SEED DEPARTMENTS
INSERT INTO departments (name, module_key, headcount_target) VALUES
  ('HR',            'hr',            3),
  ('Sales',         'sales',         22),
  ('Logistics',     'logistics',     80),
  ('Manufacturing', 'manufacturing', 55),
  ('Procurement',   'procurement',   4),
  ('Finance',       'finance',       4),
  ('Paperwork',     'paperwork',     5);

-- VIEWS
CREATE OR REPLACE VIEW vw_hr_dashboard AS
SELECT
  (SELECT COUNT(*) FROM employees WHERE status='active')              AS active_employees,
  (SELECT COUNT(*) FROM performance_scores WHERE week_start=date_trunc('week',NOW())::DATE AND tier='poor') AS poor_performers_this_week,
  (SELECT COUNT(*) FROM shipments WHERE status NOT IN ('delivered'))   AS active_shipments,
  (SELECT COUNT(*) FROM escrows WHERE status IN ('open','delivery_confirmed') AND days_outstanding >= 7) AS overdue_escrows,
  (SELECT COUNT(*) FROM documents WHERE expiry_date <= NOW()+INTERVAL '30 days' AND status NOT IN ('expired')) AS docs_expiring_soon,
  (SELECT COUNT(*) FROM agent_tasks WHERE deadline < NOW()::DATE AND status != 'confirmed') AS overdue_agent_tasks,
  (SELECT COUNT(*) FROM employees WHERE last_active_at < NOW()-INTERVAL '3 days' AND status='active') AS inactive_employees;
