-- =============================================
-- FIX: registration fails for EVERYONE with
--   "function gen_salt(unknown) does not exist"
--
-- Cause: register_customer_with_vehicles() and customer_login() are
-- SECURITY DEFINER functions declared with `SET search_path = public`.
-- They call gen_salt()/crypt() from the pgcrypto extension, but on
-- Supabase pgcrypto lives in the `extensions` schema, which is NOT on
-- that search_path — so the bcrypt functions can't be found and every
-- registration throws.
--
-- Fix: make sure pgcrypto is installed, and add `extensions` to the
-- search_path of both functions so gen_salt()/crypt() resolve.
--
-- Apply this in the Supabase dashboard → SQL Editor → Run.
-- =============================================

-- Ensure the extension exists (Supabase installs it into `extensions`).
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------- registration (identical body to 004, corrected search_path) ----------
CREATE OR REPLACE FUNCTION register_customer_with_vehicles(
  customer_data jsonb,
  vehicles_data jsonb
)
RETURNS customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_customer customers;
  v jsonb;
  raw_password text;
BEGIN
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

  new_customer.password_hash := NULL;
  RETURN new_customer;
END;
$$;

GRANT EXECUTE ON FUNCTION register_customer_with_vehicles(jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION register_customer_with_vehicles(jsonb, jsonb) TO authenticated;

-- ---------- login (identical body to 004, corrected search_path) ----------
CREATE OR REPLACE FUNCTION customer_login(
  p_phone text,
  p_password text
)
RETURNS customers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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
