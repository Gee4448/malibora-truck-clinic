# send-sms Edge Function (Africa's Talking)

Sends customer SMS notifications (inspection complete, invoice ready, car ready)
without exposing the API key to the browser. Logs every attempt to `sms_log`.

## One-time activation

The feature is **inactive until these steps are done** — until then the app runs
normally and every send is recorded in `sms_log` with status `skipped`.

1. Create an Africa's Talking account (https://account.africastalking.com) and,
   from the dashboard, copy your **Username** and generate an **API Key**.
   Optionally register an alphanumeric **Sender ID** (e.g. `MALIBORA`); without
   one, messages send from a shared short code.
2. Apply migration `014_sms_notifications.sql` (creates `sms_log`).
3. Set the secrets (requires the Supabase CLI, logged in and linked to the project):

   ```bash
   supabase secrets set AT_USERNAME=your_username AT_API_KEY=your_key AT_SENDER_ID=MALIBORA
   ```

   Leave `AT_SENDER_ID` off if you have not registered one yet.

4. Deploy the function:

   ```bash
   supabase functions deploy send-sms
   ```

That's it — sends start going out on the next inspection-complete / invoice-sent /
handover event. Check results in the `sms_log` table.

## Testing for free (sandbox)

Set `AT_USERNAME=sandbox` and use the **sandbox API key** from your account. The
function automatically targets `api.sandbox.africastalking.com`. Sandbox messages
don't reach real phones — you watch them in the Africa's Talking **Simulator**
(launch it from the dashboard). Switch `AT_USERNAME` to your real username and key
when you're ready to send for real.

## Notes

- Phone numbers are normalized to E.164 (`+255XXXXXXXXX`) before sending.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically by the
  Supabase runtime; you do not set those.
- To change message wording, edit `smsTemplates` in `src/lib/sms.js`.
