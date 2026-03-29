-- Persist buyer-chosen customization options per cart line and order line.
alter table public.app_cart_items
  add column if not exists selections jsonb not null default '[]'::jsonb;

alter table public.app_order_line_items
  add column if not exists selections jsonb not null default '[]'::jsonb;
