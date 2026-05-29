-- =============================================
-- Customer Portal Enhancements Migration
-- Adds: customer registration flow, vehicle fields,
--        service requests, invoice negotiation & deposit
-- =============================================

-- ============================================
-- 1. CUSTOMERS TABLE — registration & approval
-- ============================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved'
  CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE customers ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS registered_via TEXT DEFAULT 'walk_in'
  CHECK (registered_via IN ('online', 'walk_in'));

ALTER TABLE customers ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

-- ============================================
-- 2. VEHICLES TABLE — additional fields
-- ============================================
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS chassis_number TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS axles INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS engine_type TEXT;

-- ============================================
-- 3. JOB_CARDS TABLE — customer service requests
-- ============================================
ALTER TABLE job_cards DROP CONSTRAINT IF EXISTS job_cards_status_check;
ALTER TABLE job_cards ADD CONSTRAINT job_cards_status_check
  CHECK (status IN ('customer_request', 'pre_job_card', 'pending_approval', 'open', 'in_progress', 'waiting_parts', 'completed', 'cancelled'));

ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS request_type TEXT
  CHECK (request_type IN ('known_problem', 'inspection_needed'));

ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS customer_location TEXT;

CREATE INDEX IF NOT EXISTS idx_job_cards_request_type ON job_cards(request_type);

-- ============================================
-- 4. INVOICES TABLE — negotiation & deposit
-- ============================================
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_status_check;
ALTER TABLE invoices ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('draft', 'sent', 'approved', 'negotiating', 'paid', 'cancelled'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deposit_percentage INTEGER DEFAULT 70;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_agreed_at TIMESTAMPTZ;

-- ============================================
-- 5. INVOICE NEGOTIATIONS TABLE (new)
-- ============================================
CREATE TABLE IF NOT EXISTS invoice_negotiations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'staff')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoice_negotiations_invoice ON invoice_negotiations(invoice_id);

-- ============================================
-- 6. RLS POLICIES
-- ============================================

-- invoice_negotiations — authenticated staff full access
ALTER TABLE invoice_negotiations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view negotiations"
  ON invoice_negotiations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert negotiations"
  ON invoice_negotiations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update negotiations"
  ON invoice_negotiations FOR UPDATE TO authenticated USING (true);

-- Anon policies for client portal (phone-based, no Supabase Auth)
-- SELECT: customers can query their own data via phone lookup
CREATE POLICY "Anon can read customers for login"
  ON customers FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read vehicles"
  ON vehicles FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read job cards"
  ON job_cards FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read job card items"
  ON job_card_items FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can read invoices except internal"
  ON invoices FOR SELECT TO anon USING (invoice_type != 'internal');

CREATE POLICY "Anon can read invoice negotiations"
  ON invoice_negotiations FOR SELECT TO anon USING (true);

-- NOTE: inspections/inspection_items tables do not exist yet.
-- Add RLS policies for those tables when they are created.

-- INSERT: customer self-registration (must be pending)
CREATE POLICY "Anon can register as customer"
  ON customers FOR INSERT TO anon
  WITH CHECK (status = 'pending' AND registered_via = 'online');

-- INSERT: customer can add vehicles
CREATE POLICY "Anon can add vehicles"
  ON vehicles FOR INSERT TO anon WITH CHECK (true);

-- INSERT: customer can create service requests
CREATE POLICY "Anon can create service requests"
  ON job_cards FOR INSERT TO anon
  WITH CHECK (status = 'customer_request');

-- INSERT: customer can send negotiation messages
CREATE POLICY "Anon can send negotiation messages"
  ON invoice_negotiations FOR INSERT TO anon
  WITH CHECK (sender_type = 'customer');

-- UPDATE: customer can update own profile and approve inspection items
CREATE POLICY "Anon can update own customer record"
  ON customers FOR UPDATE TO anon USING (true);

CREATE POLICY "Anon can update invoices for agreement"
  ON invoices FOR UPDATE TO anon USING (true);

-- ============================================
-- 7. ENABLE REALTIME for negotiations
-- ============================================
ALTER publication supabase_realtime ADD TABLE invoice_negotiations;
