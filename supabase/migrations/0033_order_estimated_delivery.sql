-- Estimated delivery window shown to buyers at checkout; persisted on the order.
alter table public.app_orders
  add column if not exists estimated_delivery_start_at timestamptz,
  add column if not exists estimated_delivery_end_at timestamptz,
  add column if not exists estimated_delivery_range_display text;

comment on column public.app_orders.estimated_delivery_start_at is 'Lower bound of buyer-facing delivery estimate (order placement + policy window).';
comment on column public.app_orders.estimated_delivery_end_at is 'Upper bound of buyer-facing delivery estimate.';
comment on column public.app_orders.estimated_delivery_range_display is 'Preformatted range string as shown at checkout (locale-specific).';
