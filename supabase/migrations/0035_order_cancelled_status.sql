-- Seller (or admin) can mark an order cancelled with a required reason stored on the row.
alter table public.app_orders drop constraint if exists app_orders_status_check;

alter table public.app_orders
  add constraint app_orders_status_check
  check (
    status in (
      'created',
      'confirmed',
      'processing',
      'shipped',
      'delivered',
      'cancelled'
    )
  );

alter table public.app_orders
  add column if not exists cancellation_reason text;

comment on column public.app_orders.cancellation_reason is 'Why the seller (or admin) cancelled the order; shown to the buyer.';
