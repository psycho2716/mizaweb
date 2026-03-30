create table if not exists recommendation_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  event_type text not null,
  created_at timestamptz not null default now()
);
