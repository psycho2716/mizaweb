create table if not exists app_users (
  id text primary key,
  email text not null,
  role text not null check (role in ('buyer', 'seller', 'admin'))
);

create table if not exists app_seller_status (
  seller_id text primary key references app_users(id) on delete cascade,
  status text not null check (status in ('unsubmitted', 'pending', 'approved', 'rejected'))
);

create table if not exists app_verifications (
  id text primary key,
  seller_id text not null references app_users(id) on delete cascade,
  permit_file_url text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  note text,
  rejection_reason text
);

create table if not exists app_products (
  id text primary key,
  seller_id text not null references app_users(id) on delete cascade,
  title text not null,
  description text not null,
  base_price numeric(12,2) not null check (base_price > 0),
  is_published boolean not null default false
);

create table if not exists app_product_media (
  id text primary key,
  product_id text not null references app_products(id) on delete cascade,
  url text not null
);

create table if not exists app_customization_options (
  id text primary key,
  product_id text not null references app_products(id) on delete cascade,
  name text not null,
  values text[] not null default '{}'
);

create table if not exists app_customization_rules (
  id text primary key,
  product_id text not null references app_products(id) on delete cascade,
  label text not null,
  amount numeric(12,2) not null
);

create table if not exists app_cart_items (
  id text primary key,
  buyer_id text not null references app_users(id) on delete cascade,
  product_id text not null references app_products(id) on delete cascade,
  quantity int not null check (quantity > 0)
);

create table if not exists app_orders (
  id text primary key,
  buyer_id text not null references app_users(id) on delete cascade,
  status text not null check (status in ('created', 'confirmed', 'processing', 'shipped', 'delivered')),
  created_at timestamptz not null default now()
);
