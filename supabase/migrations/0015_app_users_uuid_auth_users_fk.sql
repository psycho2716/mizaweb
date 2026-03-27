-- Auth-centric model: public.app_users.id = auth.users.id (UUID).
-- Passwords live only in Supabase Auth; app_user_credentials is removed.

drop table if exists app_order_messages cascade;
drop table if exists app_cart_items cascade;
drop table if exists app_customization_rules cascade;
drop table if exists app_customization_options cascade;
drop table if exists app_product_media cascade;
drop table if exists app_products cascade;
drop table if exists app_orders cascade;
drop table if exists app_verifications cascade;
drop table if exists app_seller_profiles cascade;
drop table if exists app_seller_status cascade;
drop table if exists app_user_credentials cascade;
drop table if exists app_users cascade;

create table app_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('buyer', 'seller', 'admin')),
  full_name text
);

create table app_seller_status (
  seller_id uuid primary key references app_users (id) on delete cascade,
  status text not null check (status in ('unsubmitted', 'pending', 'approved', 'rejected'))
);

create table app_verifications (
  id text primary key,
  seller_id uuid not null references app_users (id) on delete cascade,
  permit_file_url text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  note text,
  rejection_reason text
);

create table app_products (
  id text primary key,
  seller_id uuid not null references app_users (id) on delete cascade,
  title text not null,
  description text not null,
  base_price numeric(12, 2) not null check (base_price > 0),
  is_published boolean not null default false
);

create table app_product_media (
  id text primary key,
  product_id text not null references app_products (id) on delete cascade,
  url text not null
);

create table app_customization_options (
  id text primary key,
  product_id text not null references app_products (id) on delete cascade,
  name text not null,
  values text[] not null default '{}'
);

create table app_customization_rules (
  id text primary key,
  product_id text not null references app_products (id) on delete cascade,
  label text not null,
  amount numeric(12, 2) not null
);

create table app_cart_items (
  id text primary key,
  buyer_id uuid references app_users (id) on delete cascade,
  guest_session_id text,
  product_id text not null references app_products (id) on delete cascade,
  quantity int not null check (quantity > 0)
);

create table app_orders (
  id text primary key,
  buyer_id uuid not null references app_users (id) on delete cascade,
  seller_id uuid not null references app_users (id) on delete cascade,
  status text not null check (status in ('created', 'confirmed', 'processing', 'shipped', 'delivered')),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'online')),
  payment_reference text,
  total_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table app_seller_profiles (
  seller_id uuid primary key references app_users (id) on delete cascade,
  business_name text not null,
  contact_number text not null,
  address text not null,
  profile_image_url text,
  store_background_url text,
  payment_qr_url text
);

create table app_order_messages (
  id text primary key,
  order_id text not null references app_orders (id) on delete cascade,
  sender_id uuid not null references app_users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
