-- Migration: Add reminder_sent_at to meetings table
-- Tracks whether the "30 minutes before" push notification has been sent.
-- The notify-meeting-reminder edge function (cron every 5 min) sets this after firing.

ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

-- Partial index: only un-reminded upcoming meetings need to be scanned
CREATE INDEX IF NOT EXISTS idx_meetings_reminder
  ON meetings(scheduled_at) WHERE reminder_sent_at IS NULL;

-- ── Supabase cron setup ──────────────────────────────────────────────────────
-- After deploying the notify-meeting-reminder edge function, schedule it in
-- the Supabase Dashboard under Database > Cron Jobs:
--
--   Name:     notify-meeting-reminder
--   Schedule: */5 * * * *   (every 5 minutes)
--   Command:  select net.http_post(
--               url := '<YOUR_SUPABASE_URL>/functions/v1/notify-meeting-reminder',
--               headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>"}'::jsonb
--             );
--
-- Or via pg_cron if enabled:
-- SELECT cron.schedule(
--   'notify-meeting-reminder',
--   '*/5 * * * *',
--   $$SELECT net.http_post(url := current_setting('app.supabase_url') || '/functions/v1/notify-meeting-reminder', headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key')))$$
-- );
