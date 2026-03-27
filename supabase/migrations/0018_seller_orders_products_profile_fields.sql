alter table if exists app_products
  add column if not exists model_3d_url text;

alter table if exists app_orders
  add column if not exists payment_status text not null default 'pending'
    check (payment_status in ('pending', 'paid')),
  add column if not exists receipt_status text not null default 'none'
    check (receipt_status in ('none', 'submitted', 'resubmit_requested', 'approved')),
  add column if not exists receipt_request_note text;

alter table if exists app_seller_profiles
  add column if not exists payment_method_name text,
  add column if not exists payment_account_name text,
  add column if not exists payment_account_number text;
