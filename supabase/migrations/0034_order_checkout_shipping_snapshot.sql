-- Snapshot of buyer-entered shipping / contact at checkout (per order).
alter table public.app_orders
  add column if not exists shipping_recipient_name text,
  add column if not exists shipping_address_line text,
  add column if not exists shipping_city text,
  add column if not exists shipping_postal_code text,
  add column if not exists shipping_contact_number text,
  add column if not exists delivery_notes text;

comment on column public.app_orders.shipping_recipient_name is 'Buyer full name at checkout for this order.';
comment on column public.app_orders.shipping_address_line is 'Street / address line at checkout.';
comment on column public.app_orders.shipping_city is 'City at checkout.';
comment on column public.app_orders.shipping_postal_code is 'Postal code at checkout (digits).';
comment on column public.app_orders.shipping_contact_number is 'Contact number at checkout (digits).';
comment on column public.app_orders.delivery_notes is 'Optional buyer notes for the seller at checkout.';
