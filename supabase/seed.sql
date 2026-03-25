-- Intentionally minimal.
--
-- Auth user seeding (admin with working email/password) is handled by:
--   backend/src/scripts/seed-admin.ts
-- because Supabase CLI's SQL seeding cannot reliably call GoTrue admin
-- endpoints or generate auth credentials in this local setup.
--
-- This file exists to satisfy `db.seed.sql_paths = ["./seed.sql"]` and to
-- remove the "no files matched pattern" warning during `supabase db reset`.

