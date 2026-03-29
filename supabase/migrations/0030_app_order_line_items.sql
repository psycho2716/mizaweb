-- Line items per order (needed for “review only after delivered purchase of this product”).
create table if not exists public.app_order_line_items (
  id text primary key,
  order_id text not null references public.app_orders (id) on delete cascade,
  product_id text not null references public.app_products (id) on delete restrict,
  quantity int not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create index if not exists app_order_line_items_order_id_idx
  on public.app_order_line_items (order_id);

create index if not exists app_order_line_items_product_id_idx
  on public.app_order_line_items (product_id);

alter table public.app_order_line_items enable row level security;
alter table public.app_order_line_items force row level security;
