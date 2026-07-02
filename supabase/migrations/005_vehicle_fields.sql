-- =============================================
-- Vehicle form field rework
--
-- The vehicle registration form now collects:
--   registration_number, chassis_number, make, model, year, color,
--   vehicle_type, mileage (km)
-- and no longer collects engine_type / axles / fuel_type.
--
-- Two schema changes are needed:
--   1. vehicle_type had a CHECK constraint limiting it to a fixed list
--      (truck/bus/trailer/pickup/car/other). The form now allows custom
--      types (SUV, machine, "type your own"), so we drop that constraint.
--   2. register_customer_with_vehicles (client self-signup RPC) must persist
--      the new fields year / color / mileage_km.
-- =============================================

-- 1. Allow any vehicle_type value (custom types entered by the user).
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_vehicle_type_check;

-- 2. Recreate the signup RPC so it stores the new vehicle fields.
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

  -- Vehicles are optional — only insert if any were submitted.
  IF vehicles_data IS NOT NULL AND jsonb_array_length(vehicles_data) > 0 THEN
    FOR v IN SELECT * FROM jsonb_array_elements(vehicles_data)
    LOOP
      INSERT INTO vehicles (
        customer_id, vehicle_type, make, model, registration_number,
        chassis_number, year, color, mileage_km
      )
      VALUES (
        new_customer.id,
        v->>'vehicle_type',
        v->>'make',
        v->>'model',
        v->>'registration_number',
        v->>'chassis_number',
        NULLIF(v->>'year', '')::integer,
        v->>'color',
        NULLIF(v->>'mileage_km', '')::integer
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
