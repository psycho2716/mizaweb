-- Phase 2–9: customization templates, snapshots, AI jobs/cache, orders + RLS

begin;

-- Per-product customization template (seller-defined schema_json).
create table if not exists public.product_customization_templates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null unique references public.products(id) on delete cascade,
  schema_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_customization_templates_product_id_idx
  on public.product_customization_templates(product_id);

drop trigger if exists product_customization_templates_set_updated_at on public.product_customization_templates;
create trigger product_customization_templates_set_updated_at
before update on public.product_customization_templates
for each row execute function public.set_updated_at();

-- Customer customization snapshots (normalized server-side).
create table if not exists public.customizations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  customer_id uuid not null references public.profiles(id) on delete cascade,
  snapshot_json jsonb not null,
  computed_price numeric(12, 2),
  status text not null default 'submitted' check (status in ('draft', 'submitted', 'ordered')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customizations_customer_id_idx on public.customizations(customer_id);
create index if not exists customizations_product_id_idx on public.customizations(product_id);
create index if not exists customizations_seller_id_idx on public.customizations(seller_id);

drop trigger if exists customizations_set_updated_at on public.customizations;
create trigger customizations_set_updated_at
before update on public.customizations
for each row execute function public.set_updated_at();

-- AI 2D→3D jobs (one row per generation request).
create table if not exists public.ai_2d_to_3d_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  customization_id uuid references public.customizations(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'completed', 'failed')),
  input_image_sha256 text not null,
  output_storage_path text,
  cache_hit boolean,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_jobs_user_id_idx on public.ai_2d_to_3d_jobs(user_id);
create index if not exists ai_jobs_product_id_idx on public.ai_2d_to_3d_jobs(product_id);

drop trigger if exists ai_2d_to_3d_jobs_set_updated_at on public.ai_2d_to_3d_jobs;
create trigger ai_2d_to_3d_jobs_set_updated_at
before update on public.ai_2d_to_3d_jobs
for each row execute function public.set_updated_at();

-- Cache table (backend service-role only in practice).
create table if not exists public.ai_2d_to_3d_cache (
  cache_key text primary key,
  output_storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_2d_to_3d_cache_set_updated_at on public.ai_2d_to_3d_cache;
create trigger ai_2d_to_3d_cache_set_updated_at
before update on public.ai_2d_to_3d_cache
for each row execute function public.set_updated_at();

-- Orders (MVP).
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  customization_id uuid not null references public.customizations(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  total_amount numeric(12, 2) not null default 0,
  delivery_method text not null check (delivery_method in ('delivery', 'pickup')),
  delivery_address_line1 text,
  delivery_city text,
  delivery_notes text,
  order_status text not null default 'pending'
    check (order_status in ('pending', 'confirmed', 'shipped', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_seller_id_idx on public.orders(seller_id);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- =========================
-- RLS
-- =========================

alter table public.product_customization_templates enable row level security;
alter table public.customizations enable row level security;
alter table public.ai_2d_to_3d_jobs enable row level security;
alter table public.ai_2d_to_3d_cache enable row level security;
alter table public.orders enable row level security;

-- Templates: read for published+approved product OR owner seller OR admin.
drop policy if exists pct_select_public_published on public.product_customization_templates;
create policy pct_select_public_published
on public.product_customization_templates
for select
using (
  exists (
    select 1
    from public.products p
    join public.seller_verifications sv on sv.seller_id = p.seller_id
    where p.id = product_customization_templates.product_id
      and p.status = 'published'
      and sv.status = 'approved'
  )
  or exists (
    select 1 from public.products p
    where p.id = product_customization_templates.product_id
      and p.seller_id = auth.uid()
  )
  or public.is_admin()
);

drop policy if exists pct_write_seller_own_product on public.product_customization_templates;
create policy pct_write_seller_own_product
on public.product_customization_templates
for all
using (
  exists (
    select 1 from public.products p
    where p.id = product_customization_templates.product_id
      and p.seller_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.products p
    where p.id = product_customization_templates.product_id
      and p.seller_id = auth.uid()
  )
);

drop policy if exists pct_admin_all on public.product_customization_templates;
create policy pct_admin_all
on public.product_customization_templates
for all
using (public.is_admin())
with check (public.is_admin());

-- Customizations: customer owns; seller sees rows for their products; admin all.
drop policy if exists cust_insert_self on public.customizations;
create policy cust_insert_self
on public.customizations
for insert
with check (customer_id = auth.uid());

drop policy if exists cust_select_own on public.customizations;
create policy cust_select_own
on public.customizations
for select
using (customer_id = auth.uid());

drop policy if exists cust_select_seller_product on public.customizations;
create policy cust_select_seller_product
on public.customizations
for select
using (seller_id = auth.uid());

drop policy if exists cust_admin_select on public.customizations;
create policy cust_admin_select
on public.customizations
for select
using (public.is_admin());

drop policy if exists cust_update_own_draft on public.customizations;
create policy cust_update_own_draft
on public.customizations
for update
using (customer_id = auth.uid() and status = 'draft')
with check (customer_id = auth.uid());

-- AI jobs: owning user only.
drop policy if exists ai_jobs_insert_self on public.ai_2d_to_3d_jobs;
create policy ai_jobs_insert_self
on public.ai_2d_to_3d_jobs
for insert
with check (user_id = auth.uid());

drop policy if exists ai_jobs_select_self on public.ai_2d_to_3d_jobs;
create policy ai_jobs_select_self
on public.ai_2d_to_3d_jobs
for select
using (user_id = auth.uid());

drop policy if exists ai_jobs_update_self on public.ai_2d_to_3d_jobs;
create policy ai_jobs_update_self
on public.ai_2d_to_3d_jobs
for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Cache: block direct client access (service role bypasses RLS).
alter table public.ai_2d_to_3d_cache enable row level security;

-- Orders
drop policy if exists orders_insert_customer on public.orders;
create policy orders_insert_customer
on public.orders
for insert
with check (customer_id = auth.uid());

drop policy if exists orders_select_customer on public.orders;
create policy orders_select_customer
on public.orders
for select
using (customer_id = auth.uid());

drop policy if exists orders_select_seller on public.orders;
create policy orders_select_seller
on public.orders
for select
using (seller_id = auth.uid());

drop policy if exists orders_admin_all on public.orders;
create policy orders_admin_all
on public.orders
for all
using (public.is_admin())
with check (public.is_admin());

commit;
