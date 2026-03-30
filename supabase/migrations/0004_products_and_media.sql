create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  seller_profile_id uuid not null references seller_profiles(id) on delete cascade,
  title text not null,
  description text not null,
  base_price numeric(12,2) not null check (base_price > 0),
  is_published boolean not null default false,
  created_at timestamptz not null default now()
);
