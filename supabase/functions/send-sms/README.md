# send-sms Edge Function (Beem Africa)

Sends customer SMS notifications (inspection complete, invoice ready, car ready)
without exposing the API key to the browser. Logs every attempt to `sms_log`.

## One-time activation

The feature is **inactive until these steps are done** — until then the app runs
normally and every send is recorded in `sms_log` with status `skipped`.

1. Create a Beem Africa account (https://beem.africa) and get an **API Key** and
   **Secret Key**. Register a sender ID (e.g. `MALIBORA`).
2. Apply migration `014_sms_notifications.sql` (creates `sms_log`).
3. Set the secrets (requires the Supabase CLI, logged in and linked to the project):

   ```bash
   supabase secrets set BEEM_API_KEY=your_key BEEM_SECRET_KEY=your_secret BEEM_SENDER_ID=MALIBORA
   ```

4. Deploy the function:

   ```bash
   supabase functions deploy send-sms
   ```

That's it — sends start going out on the next inspection-complete / invoice-sent /
handover event. Check results in the `sms_log` table.

## Notes

- Phone numbers are normalized to `255XXXXXXXXX` before sending.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the
  Supabase runtime; you do not set those.
- To change message wording, edit `smsTemplates` in `src/lib/sms.js`.
