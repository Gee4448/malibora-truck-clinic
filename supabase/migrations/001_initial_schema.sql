-- Malibora Truck Clinic - Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- USERS & ROLES
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'receptionist' CHECK (role IN ('owner', 'manager', 'receptionist', 'technician')),
  phone TEXT,
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- CUSTOMERS
-- ============================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  company_name TEXT,
  tin_number TEXT, -- Tax Identification Number
  address TEXT,
  id_type TEXT CHECK (id_type IN ('nida', 'passport', 'driving_license', 'voter_id')),
  id_number TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- VEHICLES
-- ============================================
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  registration_number TEXT NOT NULL,
  make TEXT NOT NULL, -- Toyota, Scania, Volvo etc
  model TEXT,
  year INTEGER,
  color TEXT,
  vin_number TEXT, -- Vehicle Identification Number
  engine_number TEXT,
  mileage_km INTEGER DEFAULT 0,
  fuel_type TEXT DEFAULT 'diesel' CHECK (fuel_type IN ('diesel', 'petrol', 'electric', 'hybrid')),
  vehicle_type TEXT DEFAULT 'truck' CHECK (vehicle_type IN ('truck', 'bus', 'trailer', 'pickup', 'car', 'other')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PARTS INVENTORY
-- ============================================
CREATE TABLE IF NOT EXISTS parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  part_number TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general' CHECK (category IN ('engine', 'brake', 'suspension', 'electrical', 'body', 'transmission', 'cooling', 'fuel', 'general')),
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0, -- Bei ya kununua (internal)
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0, -- Bei ya kuuzia customer
  quantity_in_stock INTEGER DEFAULT 0,
  minimum_stock INTEGER DEFAULT 5,
  unit TEXT DEFAULT 'piece' CHECK (unit IN ('piece', 'litre', 'metre', 'set', 'pair', 'kg')),
  supplier_name TEXT,
  supplier_phone TEXT,
  location TEXT, -- Shelf/bin location
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- LABOUR / SERVICE RATES
-- ============================================
CREATE TABLE IF NOT EXISTS labour_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_name TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'service' CHECK (category IN ('service', 'maintenance', 'body_work', 'electrical', 'diagnostics', 'other')),
  cost_rate DECIMAL(12,2) NOT NULL DEFAULT 0, -- What you pay technician
  selling_rate DECIMAL(12,2) NOT NULL DEFAULT 0, -- What customer pays
  estimated_hours DECIMAL(4,1) DEFAULT 1.0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- JOB CARDS
-- ============================================
CREATE TABLE IF NOT EXISTS job_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number TEXT UNIQUE NOT NULL, -- MTC-2024-0001 format
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  section TEXT DEFAULT 'service' CHECK (section IN ('service', 'body_work')),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_parts', 'completed', 'cancelled')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  description TEXT NOT NULL, -- Customer complaint / work required
  diagnosis TEXT, -- Technician findings
  assigned_to UUID REFERENCES profiles(id),
  mileage_in INTEGER,
  fuel_level TEXT CHECK (fuel_level IN ('empty', 'quarter', 'half', 'three_quarter', 'full')),
  date_in TIMESTAMPTZ DEFAULT NOW(),
  date_promised TIMESTAMPTZ,
  date_completed TIMESTAMPTZ,
  customer_signature_url TEXT,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- JOB CARD ITEMS (Parts + Labour used)
-- ============================================
CREATE TABLE IF NOT EXISTS job_card_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_card_id UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('part', 'labour', 'additional')),
  part_id UUID REFERENCES parts(id),
  labour_id UUID REFERENCES labour_rates(id),
  description TEXT NOT NULL,
  quantity DECIMAL(8,2) DEFAULT 1,
  cost_price DECIMAL(12,2) DEFAULT 0, -- Internal cost (hidden from customer)
  selling_price DECIMAL(12,2) DEFAULT 0, -- Customer sees this
  total_cost DECIMAL(12,2) GENERATED ALWAYS AS (quantity * cost_price) STORED,
  total_selling DECIMAL(12,2) GENERATED ALWAYS AS (quantity * selling_price) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INVOICES (Proforma → Final → Internal)
-- ============================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT UNIQUE NOT NULL, -- INV-2024-0001
  job_card_id UUID NOT NULL REFERENCES job_cards(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_type TEXT NOT NULL CHECK (invoice_type IN ('proforma', 'final', 'internal')),
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'approved', 'paid', 'cancelled')),
  -- Customer-visible totals
  subtotal_parts DECIMAL(12,2) DEFAULT 0,
  subtotal_labour DECIMAL(12,2) DEFAULT 0,
  subtotal_additional DECIMAL(12,2) DEFAULT 0,
  vat_rate DECIMAL(4,2) DEFAULT 18.00, -- Tanzania VAT 18%
  vat_amount DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total_amount DECIMAL(12,2) DEFAULT 0,
  -- Internal cost tracking (management only)
  internal_cost_parts DECIMAL(12,2) DEFAULT 0,
  internal_cost_labour DECIMAL(12,2) DEFAULT 0,
  profit_parts DECIMAL(12,2) DEFAULT 0,
  profit_labour DECIMAL(12,2) DEFAULT 0,
  profit_total DECIMAL(12,2) DEFAULT 0,
  profit_margin DECIMAL(5,2) DEFAULT 0,
  -- Payment info
  payment_method TEXT CHECK (payment_method IN ('cash', 'bank_transfer', 'mobile_money', 'cheque', 'credit')),
  payment_reference TEXT,
  paid_at TIMESTAMPTZ,
  -- Meta
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- HANDOVER CARDS
-- ============================================
CREATE TABLE IF NOT EXISTS handover_cards (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  handover_number TEXT UNIQUE NOT NULL, -- HDV-2024-0001
  job_card_id UUID NOT NULL REFERENCES job_cards(id),
  invoice_id UUID REFERENCES invoices(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  -- Work summary
  work_summary TEXT NOT NULL,
  parts_summary TEXT,
  recommendations TEXT, -- Future service recommendations
  next_service_date DATE,
  next_service_mileage INTEGER,
  -- Handover details
  mileage_out INTEGER,
  fuel_level_out TEXT CHECK (fuel_level_out IN ('empty', 'quarter', 'half', 'three_quarter', 'full')),
  customer_signature_url TEXT,
  received_by TEXT, -- Customer name or representative
  handed_over_by UUID REFERENCES profiles(id),
  handover_date TIMESTAMPTZ DEFAULT NOW(),
  -- Warranty
  warranty_parts_days INTEGER DEFAULT 30,
  warranty_labour_days INTEGER DEFAULT 7,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_vehicles_customer ON vehicles(customer_id);
CREATE INDEX idx_vehicles_reg ON vehicles(registration_number);
CREATE INDEX idx_job_cards_vehicle ON job_cards(vehicle_id);
CREATE INDEX idx_job_cards_customer ON job_cards(customer_id);
CREATE INDEX idx_job_cards_status ON job_cards(status);
CREATE INDEX idx_job_cards_number ON job_cards(job_number);
CREATE INDEX idx_invoices_job ON invoices(job_card_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_type ON invoices(invoice_type);
CREATE INDEX idx_parts_category ON parts(category);
CREATE INDEX idx_parts_name ON parts(name);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE labour_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_card_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE handover_cards ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read
CREATE POLICY "Authenticated users can view" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view" ON vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view" ON parts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view" ON labour_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view" ON job_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view" ON job_card_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view" ON handover_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can view" ON profiles FOR SELECT TO authenticated USING (true);

-- Policy: Internal invoices only visible to owner/manager
CREATE POLICY "View invoices based on role" ON invoices FOR SELECT TO authenticated
  USING (
    invoice_type != 'internal' OR
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'manager'))
  );

-- Policy: Insert/Update for staff
CREATE POLICY "Staff can insert" ON customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update" ON customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can insert" ON vehicles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update" ON vehicles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can insert" ON job_cards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update" ON job_cards FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can insert" ON job_card_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update" ON job_card_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can insert" ON invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update" ON invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can insert" ON handover_cards FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can insert" ON parts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update" ON parts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Staff can insert" ON labour_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Staff can update" ON labour_rates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Staff can insert profile" ON profiles FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Auto-generate job number
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TRIGGER AS $$
DECLARE
  year_str TEXT;
  next_num INTEGER;
BEGIN
  year_str := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(job_number FROM 'MTC-\d{4}-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM job_cards
  WHERE job_number LIKE 'MTC-' || year_str || '-%';

  NEW.job_number := 'MTC-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_job_number
  BEFORE INSERT ON job_cards
  FOR EACH ROW
  WHEN (NEW.job_number IS NULL OR NEW.job_number = '')
  EXECUTE FUNCTION generate_job_number();

-- Auto-generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
DECLARE
  prefix TEXT;
  year_str TEXT;
  next_num INTEGER;
BEGIN
  year_str := TO_CHAR(NOW(), 'YYYY');
  prefix := CASE NEW.invoice_type
    WHEN 'proforma' THEN 'PRO'
    WHEN 'final' THEN 'INV'
    WHEN 'internal' THEN 'INT'
  END;

  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM prefix || '-\d{4}-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM invoices
  WHERE invoice_number LIKE prefix || '-' || year_str || '-%';

  NEW.invoice_number := prefix || '-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invoice_number
  BEFORE INSERT ON invoices
  FOR EACH ROW
  WHEN (NEW.invoice_number IS NULL OR NEW.invoice_number = '')
  EXECUTE FUNCTION generate_invoice_number();

-- Auto-generate handover number
CREATE OR REPLACE FUNCTION generate_handover_number()
RETURNS TRIGGER AS $$
DECLARE
  year_str TEXT;
  next_num INTEGER;
BEGIN
  year_str := TO_CHAR(NOW(), 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(handover_number FROM 'HDV-\d{4}-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM handover_cards
  WHERE handover_number LIKE 'HDV-' || year_str || '-%';

  NEW.handover_number := 'HDV-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_handover_number
  BEFORE INSERT ON handover_cards
  FOR EACH ROW
  WHEN (NEW.handover_number IS NULL OR NEW.handover_number = '')
  EXECUTE FUNCTION generate_handover_number();

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_parts_updated_at BEFORE UPDATE ON parts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_labour_rates_updated_at BEFORE UPDATE ON labour_rates FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_job_cards_updated_at BEFORE UPDATE ON job_cards FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
