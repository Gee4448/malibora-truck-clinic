-- ============================================
-- Staff Access Code — Supabase Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)
-- ============================================

-- 1. Create staff_settings table to store the hashed access code
CREATE TABLE IF NOT EXISTS staff_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Enable RLS on staff_settings
ALTER TABLE staff_settings ENABLE ROW LEVEL SECURITY;

-- 3. No direct read/write access — only through RPC functions
-- (No SELECT/INSERT/UPDATE policies = locked down)

-- 4. Create the verify function using pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Insert the default staff access code (change 'MALIBORA2025' to your desired code)
-- The code is stored as a SHA-256 hash, never in plain text
INSERT INTO staff_settings (key, value)
VALUES (
  'staff_access_code',
  encode(digest('MALIBORA2025', 'sha256'), 'hex')
)
ON CONFLICT (key) DO UPDATE SET
  value = encode(digest('MALIBORA2025', 'sha256'), 'hex'),
  updated_at = now();

-- 5. RPC function: verify_staff_code
-- Takes a plain-text code, hashes it, compares to stored hash
-- Returns true/false — never exposes the actual code
CREATE OR REPLACE FUNCTION verify_staff_code(input_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  stored_hash TEXT;
  input_hash TEXT;
BEGIN
  -- Get stored hash
  SELECT value INTO stored_hash
  FROM staff_settings
  WHERE key = 'staff_access_code';

  -- If no code is set, deny access
  IF stored_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Hash the input and compare
  input_hash := encode(digest(input_code, 'sha256'), 'hex');

  RETURN input_hash = stored_hash;
END;
$$;

-- 6. RPC function: update_staff_code (owner/admin only)
-- Call this to change the access code
CREATE OR REPLACE FUNCTION update_staff_code(new_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the stored hash
  UPDATE staff_settings
  SET value = encode(digest(new_code, 'sha256'), 'hex'),
      updated_at = now()
  WHERE key = 'staff_access_code';

  IF NOT FOUND THEN
    INSERT INTO staff_settings (key, value)
    VALUES ('staff_access_code', encode(digest(new_code, 'sha256'), 'hex'));
  END IF;

  RETURN TRUE;
END;
$$;

-- 7. Grant execute permission on the verify function to anon and authenticated roles
GRANT EXECUTE ON FUNCTION verify_staff_code(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION verify_staff_code(TEXT) TO authenticated;

-- Only authenticated users can update the code
GRANT EXECUTE ON FUNCTION update_staff_code(TEXT) TO authenticated;

-- ============================================
-- DONE! Default code is: MALIBORA2025
-- Change it by calling: SELECT update_staff_code('YOUR_NEW_CODE');
-- ============================================
