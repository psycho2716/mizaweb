create table if not exists app_seller_profiles (
  seller_id text primary key references app_users(id) on delete cascade,
  business_name text not null,
  contact_number text not null,
  address text not null,
  profile_image_url text,
  store_background_url text,
  payment_qr_url text
);

alter table if exists app_cart_items
  add column if not exists guest_session_id text;

alter table if exists app_cart_items
  alter column buyer_id drop not null;

alter table if exists app_orders
  add column if not exists seller_id text references app_users(id) on delete cascade,
  add column if not exists payment_method text check (payment_method in ('cash', 'online')),
  add column if not exists payment_reference text,
  add column if not exists total_amount numeric(12,2);

update app_orders
set payment_method = coalesce(payment_method, 'cash'),
    total_amount = coalesce(total_amount, 0)
where payment_method is null or total_amount is null;
