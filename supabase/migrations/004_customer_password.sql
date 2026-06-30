-- =============================================
-- Customer Password + Optional Vehicle Migration
--
-- Adds:
--   1. customers.password_hash  (bcrypt hash via pgcrypto)
--   2. customer_login(phone, password) RPC for secure password auth
--   3. register_customer_with_vehicles now accepts a password
--      and tolerates zero vehicles (vehicle step is optional)
-- =============================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ---------- registration (updated: optional vehicles + optional password) ----------
CREATE OR REPLACE FUNCTION register_customer_with_vehicles(
  customer_data jsonb,
  vehicles_data jsonb
)
RETURNS customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_customer customers;
  v jsonb;
  raw_password text;
BEGIN
  -- Reject duplicate phone (the client passes an already-normalized number)
  IF EXISTS (
    SELECT 1 FROM customers WHERE phone = (customer_data->>'phone')
  ) THEN
    RAISE EXCEPTION 'phone_exists';
  END IF;

  raw_password := customer_data->>'password';

  INSERT INTO customers (
    full_name, phone, email, company_name, address, location,
    status, registered_via, password_hash
  )
  VALUES (
    customer_data->>'full_name',
    customer_data->>'phone',
    customer_data->>'email',
    customer_data->>'company_name',
    customer_data->>'address',
    customer_data->>'location',
    'pending',
    'online',
    CASE
      WHEN raw_password IS NOT NULL AND length(raw_password) > 0
      THEN crypt(raw_password, gen_salt('bf'))
      ELSE NULL
    END
  )
  RETURNING * INTO new_customer;

  -- Vehicles are optional now — only insert if any were submitted.
  IF vehicles_data IS NOT NULL AND jsonb_array_length(vehicles_data) > 0 THEN
    FOR v IN SELECT * FROM jsonb_array_elements(vehicles_data)
    LOOP
      INSERT INTO vehicles (
        customer_id, vehicle_type, make, model, registration_number,
        engine_type, chassis_number, axles, fuel_type
      )
      VALUES (
        new_customer.id,
        v->>'vehicle_type',
        v->>'make',
        v->>'model',
        v->>'registration_number',
        v->>'engine_type',
        v->>'chassis_number',
        NULLIF(v->>'axles', '')::integer,
        v->>'fuel_type'
      );
    END LOOP;
  END IF;

  -- Never leak the hash back to the client.
  new_customer.password_hash := NULL;
  RETURN new_customer;
END;
$$;

GRANT EXECUTE ON FUNCTION register_customer_with_vehicles(jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION register_customer_with_vehicles(jsonb, jsonb) TO authenticated;

-- ---------- login (new: phone + optional password) ----------
-- If the customer has a password_hash set, the supplied password must verify.
-- If not (e.g. walk-in customers added by staff with no password), phone-only
-- login is allowed so existing accounts keep working.
CREATE OR REPLACE FUNCTION customer_login(
  p_phone text,
  p_password text
)
RETURNS customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  matched customers;
  normalized text;
BEGIN
  normalized := regexp_replace(COALESCE(p_phone, ''), '\s+', '', 'g');
  IF normalized LIKE '0%' THEN
    normalized := '+255' || substring(normalized FROM 2);
  END IF;

  SELECT * INTO matched FROM customers
   WHERE phone = p_phone OR phone = normalized
   LIMIT 1;

  IF matched.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF matched.status = 'pending' THEN
    RAISE EXCEPTION 'pending_approval';
  END IF;

  IF matched.status = 'rejected' THEN
    RAISE EXCEPTION 'rejected';
  END IF;

  IF matched.password_hash IS NOT NULL THEN
    IF p_password IS NULL
       OR length(p_password) = 0
       OR matched.password_hash <> crypt(p_password, matched.password_hash) THEN
      RAISE EXCEPTION 'wrong_password';
    END IF;
  END IF;

  matched.password_hash := NULL;
  RETURN matched;
END;
$$;

GRANT EXECUTE ON FUNCTION customer_login(text, text) TO anon;
GRANT EXECUTE ON FUNCTION customer_login(text, text) TO authenticated;

-- ---------- anon read access for inspections (client portal) ----------
-- The inspection_workflow.sql migration only granted authenticated access,
-- which means the phone-auth (anon) client portal could not surface
-- inspection reports on the dashboard. Add read access so customers can
-- see their inspection history, and update access on inspection_items so
-- they can approve / decline individual recommendations from the service
-- detail screen.
--
-- Wrapped in DO blocks so this migration can run even on projects where
-- inspection_workflow.sql has not yet been applied — the inspection
-- policies will just be a no-op until those tables exist.
DO $$
BEGIN
  IF to_regclass('public.inspections') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anon can read inspections" ON inspections';
    EXECUTE 'CREATE POLICY "Anon can read inspections"
             ON inspections FOR SELECT TO anon USING (true)';
  END IF;

  IF to_regclass('public.inspection_items') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "Anon can read inspection items" ON inspection_items';
    EXECUTE 'CREATE POLICY "Anon can read inspection items"
             ON inspection_items FOR SELECT TO anon USING (true)';

    EXECUTE 'DROP POLICY IF EXISTS "Anon can update inspection item approval" ON inspection_items';
    EXECUTE 'CREATE POLICY "Anon can update inspection item approval"
             ON inspection_items FOR UPDATE TO anon USING (true)';
  END IF;
END
$$;
