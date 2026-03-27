create table if not exists app_seller_payment_methods (
  id text primary key,
  seller_id uuid not null references auth.users (id) on delete cascade,
  method_name text not null,
  account_name text not null,
  account_number text not null,
  qr_image_url text,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_seller_payment_methods_seller_id
  on app_seller_payment_methods (seller_id);
