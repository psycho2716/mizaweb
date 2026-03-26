alter table profiles enable row level security;
alter table seller_profiles enable row level security;
alter table seller_verification_submissions enable row level security;
alter table products enable row level security;

create policy if not exists "profiles_select_self"
on profiles for select using (auth.uid() = auth_user_id);
