-- =============================================
-- Atomic Customer Registration Migration
-- Replaces the two-step (insert customer, then insert vehicles)
-- client flow with a single transactional RPC so that a failed
-- vehicle insert can no longer orphan a `pending` customer row
-- (which would otherwise block the user from retrying, because
--  their phone number would already "exist").
--
-- SECURITY DEFINER lets the anon client run the inserts inside one
-- transaction while still respecting the existing RLS model: the
-- function is the only privileged path and it always forces
-- status = 'pending' / registered_via = 'online'.
-- =============================================

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
BEGIN
  IF jsonb_array_length(vehicles_data) < 1 THEN
    RAISE EXCEPTION 'no_vehicles';
  END IF;

  -- Reject duplicate phone (the client passes an already-normalized number)
  IF EXISTS (
    SELECT 1 FROM customers WHERE phone = (customer_data->>'phone')
  ) THEN
    RAISE EXCEPTION 'phone_exists';
  END IF;

  INSERT INTO customers (
    full_name, phone, email, company_name, address, location,
    status, registered_via
  )
  VALUES (
    customer_data->>'full_name',
    customer_data->>'phone',
    customer_data->>'email',
    customer_data->>'company_name',
    customer_data->>'address',
    customer_data->>'location',
    'pending',
    'online'
  )
  RETURNING * INTO new_customer;

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

  RETURN new_customer;
END;
$$;

-- Client portal calls this with the anon key.
GRANT EXECUTE ON FUNCTION register_customer_with_vehicles(jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION register_customer_with_vehicles(jsonb, jsonb) TO authenticated;
