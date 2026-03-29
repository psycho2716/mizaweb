-- Proof-of-payment image URL and chosen seller payment method per order (online checkout).
alter table public.app_orders
  add column if not exists receipt_proof_url text,
  add column if not exists seller_payment_method_id text;
