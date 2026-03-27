-- Platform admin seed (runs after migrations via `supabase db reset` or `supabase db seed`).
-- Default login: admin@miza.dev / Admin123!
-- Change password in production; rotate this hash if you change the default password.
--
-- Note: `app_users.id` is NOT auto-increment. It is `text` primary key (string IDs like `u-...`),
-- matching the Express API. This seed uses a fixed id `u-admin-1` so login and JWT `sub` stay stable.
-- (Supabase `auth.users` uses UUIDs; that is a separate table.)

insert into app_users (id, email, role, full_name)
values ('u-admin-1', 'admin@miza.dev', 'admin', 'Platform Admin')
on conflict (id) do update
set
  email = excluded.email,
  role = excluded.role,
  full_name = coalesce(app_users.full_name, excluded.full_name);

-- Password hash produced by backend `hashPassword('Admin123!')` (scrypt salt:key format).
insert into app_user_credentials (user_id, email, password_hash)
values (
  'u-admin-1',
  'admin@miza.dev',
  '3b84928c2648ada5c24e23afa05acf75:92b4c3d5aa5e694d37c8787741c995329dcec9ff0dd9c40ab5d799778329bc35c76e08763538f5f7a03d926ad7e769d943c4afc2eebba2fc1aee5cc8b67b6ed7'
)
on conflict (user_id) do update
set
  email = excluded.email,
  password_hash = excluded.password_hash;
