create table if not exists customization_options (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references products(id) on delete cascade,
  name text not null,
  option_type text not null,
  created_at timestamptz not null default now()
);
