-- Optional seller-provided shipment info shown to the buyer on their order.
alter table public.app_orders
  add column if not exists fulfillment_carrier_name text null;

alter table public.app_orders
  add column if not exists fulfillment_tracking_number text null;

alter table public.app_orders
  add column if not exists fulfillment_notes text null;
