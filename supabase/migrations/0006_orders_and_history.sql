create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  buyer_profile_id uuid not null references profiles(id) on delete restrict,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
