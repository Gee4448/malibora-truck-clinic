-- =============================================
-- Inspection Workflow Migration
-- Flow: Inspection -> Pre-Job Card -> Job Card
-- =============================================

-- 1. Inspections table
CREATE TABLE IF NOT EXISTS inspections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_number text UNIQUE,
  customer_id uuid REFERENCES customers(id) NOT NULL,
  vehicle_id uuid REFERENCES vehicles(id) NOT NULL,
  status text DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'paid', 'in_progress', 'completed', 'cancelled')),
  payment_status text DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid')),
  payment_amount numeric(12,2) DEFAULT 0,
  payment_method text,
  payment_reference text,
  description text,
  mileage_in integer,
  fuel_level text,
  inspected_by text,
  date_paid timestamptz,
  date_started timestamptz,
  date_completed timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Inspection items (problems found during inspection)
CREATE TABLE IF NOT EXISTS inspection_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  inspection_id uuid REFERENCES inspections(id) ON DELETE CASCADE NOT NULL,
  problem_description text NOT NULL,
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  recommended_action text,
  estimated_cost numeric(12,2) DEFAULT 0,
  customer_approved boolean DEFAULT null,
  notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 3. Add inspection reference and pre_job_card status to job_cards
ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS inspection_id uuid REFERENCES inspections(id);
-- Update the status check to include pre_job_card
ALTER TABLE job_cards DROP CONSTRAINT IF EXISTS job_cards_status_check;
ALTER TABLE job_cards ADD CONSTRAINT job_cards_status_check
  CHECK (status IN ('pre_job_card', 'pending_approval', 'open', 'in_progress', 'waiting_parts', 'completed', 'cancelled'));

-- 4. Additional services approval tracking on job_card_items
ALTER TABLE job_card_items ADD COLUMN IF NOT EXISTS requires_approval boolean DEFAULT false;
ALTER TABLE job_card_items ADD COLUMN IF NOT EXISTS approval_status text DEFAULT 'approved' CHECK (approval_status IN ('pending', 'approved', 'rejected'));
ALTER TABLE job_card_items ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE job_card_items ADD COLUMN IF NOT EXISTS is_additional boolean DEFAULT false;

-- 5. Technician assignment on job_cards
ALTER TABLE job_cards ADD COLUMN IF NOT EXISTS assigned_technician text;

-- 6. Auto-generate inspection number
CREATE OR REPLACE FUNCTION generate_inspection_number()
RETURNS trigger AS $$
DECLARE
  next_num integer;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(inspection_number FROM 5) AS integer)), 0) + 1
  INTO next_num
  FROM inspections;
  NEW.inspection_number := 'INS-' || LPAD(next_num::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_inspection_number ON inspections;
CREATE TRIGGER set_inspection_number
BEFORE INSERT ON inspections
FOR EACH ROW
WHEN (NEW.inspection_number IS NULL)
EXECUTE FUNCTION generate_inspection_number();

-- 7. Auto-update updated_at
CREATE OR REPLACE FUNCTION update_inspection_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_inspections_updated_at ON inspections;
CREATE TRIGGER update_inspections_updated_at
BEFORE UPDATE ON inspections
FOR EACH ROW
EXECUTE FUNCTION update_inspection_timestamp();

-- 8. RLS policies
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated users" ON inspections;
CREATE POLICY "Allow all for authenticated users" ON inspections
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for authenticated users" ON inspection_items;
CREATE POLICY "Allow all for authenticated users" ON inspection_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 9. Enable realtime
ALTER publication supabase_realtime ADD TABLE inspections;
ALTER publication supabase_realtime ADD TABLE inspection_items;
