alter table profiles enable row level security;
alter table seller_profiles enable row level security;
alter table seller_verification_submissions enable row level security;
alter table products enable row level security;

-- Postgres <15 has no CREATE POLICY IF NOT EXISTS; use drop + create for idempotent runs.
drop policy if exists "profiles_select_self" on profiles;
create policy "profiles_select_self"
on profiles for select using (auth.uid() = auth_user_id);
