-- =============================================
-- 026: "Pay number" as its own payment channel type
--
-- Antony, 29 Jul 2026: "in the payment form there should be several ways of
-- payment... mainly mobile money and the bank and also pay number."
--
-- A Lipa Namba / till number is technically mobile money, but the garage and
-- the customer think of it as a separate thing — you send to a NUMBER that
-- belongs to the business, not to a person's wallet. Giving it its own type
-- means Settings can publish it as such and the portal can label it correctly.
--
-- invoice_payments.method and inspection_payments.method are plain TEXT with no
-- CHECK, so the matching option in the payment forms needed no migration.
--
-- Apply in the Supabase dashboard -> SQL Editor -> Run.
-- =============================================

ALTER TABLE payment_channels DROP CONSTRAINT IF EXISTS payment_channels_channel_type_check;
ALTER TABLE payment_channels ADD CONSTRAINT payment_channels_channel_type_check
  CHECK (channel_type IN ('bank', 'mobile_money', 'pay_number', 'cash', 'other'));
