-- Phase 0: Foundations schema + baseline RLS + storage bucket hardening
-- This is intentionally MVP-focused (auth + catalog gating).

begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profiles: one row per auth.users entry.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'seller', 'customer')),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Role helper functions (used by multiple RLS policies).
create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  );
$$;

create or replace function public.is_seller()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'seller'
  );
$$;

-- Auto-create profile row on user sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', new.raw_user_meta_data->>'user_role', 'customer'),
    new.raw_user_meta_data->>'fullName'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Seller verification workflow (permit review gate).
create table if not exists public.seller_verifications (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  permit_storage_path text not null,
  status text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  admin_notes text,
  reviewed_by_admin_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists seller_verifications_set_updated_at on public.seller_verifications;
create trigger seller_verifications_set_updated_at
before update on public.seller_verifications
for each row execute function public.set_updated_at();

-- Seller shop locations (for map pins, later UI).
create table if not exists public.seller_locations (
  seller_id uuid primary key references public.profiles(id) on delete cascade,
  shop_lat double precision not null,
  shop_lng double precision not null,
  shop_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists seller_locations_set_updated_at on public.seller_locations;
create trigger seller_locations_set_updated_at
before update on public.seller_locations
for each row execute function public.set_updated_at();

-- Products: exactly one primary 2D image per seller product (Phase 1/2 rules).
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text not null check (category in ('marble', 'limestone', 'pebbles')),
  description text not null,
  status text not null check (status in ('draft', 'published')) default 'draft',
  primary_image_storage_path text not null,
  primary_image_sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_seller_id_idx on public.products(seller_id);
create index if not exists products_status_idx on public.products(status);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- =========================
-- RLS (Row Level Security)
-- =========================

alter table public.profiles enable row level security;
alter table public.seller_verifications enable row level security;
alter table public.seller_locations enable row level security;
alter table public.products enable row level security;

-- Profiles: users can read/update own display info.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
using (id = auth.uid());

drop policy if exists profiles_update_own_display on public.profiles;
create policy profiles_update_own_display
on public.profiles
for update
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = (select role from public.profiles where id = auth.uid())
);

-- Seller verifications:
-- - public read only for approved sellers (needed by catalog + gating).
-- - sellers can insert and update their own pending permit path.
-- - admins can update status.
drop policy if exists seller_verifications_select_approved_public on public.seller_verifications;
create policy seller_verifications_select_approved_public
on public.seller_verifications
for select
using (status = 'approved');

drop policy if exists seller_verifications_select_own on public.seller_verifications;
create policy seller_verifications_select_own
on public.seller_verifications
for select
using (seller_id = auth.uid());

drop policy if exists seller_verifications_admin_select on public.seller_verifications;
create policy seller_verifications_admin_select
on public.seller_verifications
for select
using (public.is_admin());

drop policy if exists seller_verifications_insert_pending_self on public.seller_verifications;
create policy seller_verifications_insert_pending_self
on public.seller_verifications
for insert
with check (
  seller_id = auth.uid()
  and status = 'pending'
);

drop policy if exists seller_verifications_update_pending_self on public.seller_verifications;
create policy seller_verifications_update_pending_self
on public.seller_verifications
for update
using (
  seller_id = auth.uid()
  and status = 'pending'
)
with check (
  seller_id = auth.uid()
  and status = 'pending'
);

drop policy if exists seller_verifications_admin_update on public.seller_verifications;
create policy seller_verifications_admin_update
on public.seller_verifications
for update
using (public.is_admin())
with check (public.is_admin());

-- Seller locations:
-- - seller can write their own.
-- - select is allowed only when seller is approved.
drop policy if exists seller_locations_select_approved on public.seller_locations;
create policy seller_locations_select_approved
on public.seller_locations
for select
using (
  exists (
    select 1
    from public.seller_verifications sv
    where sv.seller_id = public.seller_locations.seller_id
      and sv.status = 'approved'
  )
);

drop policy if exists seller_locations_select_own on public.seller_locations;
create policy seller_locations_select_own
on public.seller_locations
for select
using (seller_id = auth.uid());

drop policy if exists seller_locations_admin_select on public.seller_locations;
create policy seller_locations_admin_select
on public.seller_locations
for select
using (public.is_admin());

drop policy if exists seller_locations_upsert_own on public.seller_locations;
create policy seller_locations_upsert_own
on public.seller_locations
for insert
with check (seller_id = auth.uid());

drop policy if exists seller_locations_update_own on public.seller_locations;
create policy seller_locations_update_own
on public.seller_locations
for update
using (seller_id = auth.uid())
with check (seller_id = auth.uid());

-- Products:
-- - customers/public can read published products from approved sellers.
-- - sellers can read their own products (draft & published).
-- - sellers can insert/update products, but publishing requires approved seller verification.
-- - admins can read/write for moderation gate (later UI).

drop policy if exists products_select_published_approved_public on public.products;
create policy products_select_published_approved_public
on public.products
for select
using (
  status = 'published'
  and exists (
    select 1
    from public.seller_verifications sv
    where sv.seller_id = public.products.seller_id
      and sv.status = 'approved'
  )
);

drop policy if exists products_select_own on public.products;
create policy products_select_own
on public.products
for select
using (seller_id = auth.uid());

drop policy if exists products_admin_select on public.products;
create policy products_admin_select
on public.products
for select
using (public.is_admin());

drop policy if exists products_insert_seller_gate on public.products;
create policy products_insert_seller_gate
on public.products
for insert
with check (
  seller_id = auth.uid()
  and (
    status = 'draft'
    or (
      status = 'published'
      and exists (
        select 1
        from public.seller_verifications sv
        where sv.seller_id = public.products.seller_id
          and sv.status = 'approved'
      )
    )
  )
);

drop policy if exists products_update_seller_gate on public.products;
create policy products_update_seller_gate
on public.products
for update
using (seller_id = auth.uid())
with check (
  seller_id = auth.uid()
  and (
    status = 'draft'
    or (
      status = 'published'
      and exists (
        select 1
        from public.seller_verifications sv
        where sv.seller_id = public.products.seller_id
          and sv.status = 'approved'
      )
    )
  )
);

drop policy if exists products_delete_own on public.products;
create policy products_delete_own
on public.products
for delete
using (seller_id = auth.uid());

drop policy if exists products_admin_modify on public.products;
create policy products_admin_modify
on public.products
for update
using (public.is_admin())
with check (public.is_admin());

-- ======================
-- Storage buckets/policies
-- ======================

-- Create buckets if they don't exist yet.
insert into storage.buckets (id, name, public)
values ('seller-permits', 'seller-permits', false)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('product-primary-2d', 'product-primary-2d', false)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('ai-2d-to-3d-models', 'ai-2d-to-3d-models', false)
on conflict (id) do update set public = excluded.public;

-- seller-permits: seller owns their uploaded permit; admin can read.
drop policy if exists seller_permits_owner_select on storage.objects;
create policy seller_permits_owner_select
on storage.objects
for select
using (
  bucket_id = 'seller-permits'
  and owner = auth.uid()
);

drop policy if exists seller_permits_owner_insert on storage.objects;
create policy seller_permits_owner_insert
on storage.objects
for insert
with check (
  bucket_id = 'seller-permits'
  and owner = auth.uid()
);

drop policy if exists seller_permits_admin_select on storage.objects;
create policy seller_permits_admin_select
on storage.objects
for select
using (
  bucket_id = 'seller-permits'
  and public.is_admin()
);

-- product-primary-2d:
-- - sellers can upload/update their own objects.
-- - public read allowed only when the object belongs to a published product from an approved seller.
drop policy if exists product_primary_2d_owner_write on storage.objects;
create policy product_primary_2d_owner_write
on storage.objects
for insert
with check (
  bucket_id = 'product-primary-2d'
  and owner = auth.uid()
);

drop policy if exists product_primary_2d_owner_select on storage.objects;
create policy product_primary_2d_owner_select
on storage.objects
for select
using (
  bucket_id = 'product-primary-2d'
  and owner = auth.uid()
);

drop policy if exists product_primary_2d_public_read_published on storage.objects;
create policy product_primary_2d_public_read_published
on storage.objects
for select
using (
  bucket_id = 'product-primary-2d'
  and exists (
    select 1
    from public.products p
    join public.seller_verifications sv on sv.seller_id = p.seller_id
    where p.primary_image_storage_path = storage.objects.name
      and p.status = 'published'
      and sv.status = 'approved'
  )
);

-- ai-2d-to-3d-models:
-- Placeholder hardening: only authenticated users (job owner) can read/write later.
drop policy if exists ai_models_owner_select on storage.objects;
create policy ai_models_owner_select
on storage.objects
for select
using (
  bucket_id = 'ai-2d-to-3d-models'
  and owner = auth.uid()
);

drop policy if exists ai_models_owner_write on storage.objects;
create policy ai_models_owner_write
on storage.objects
for insert
with check (
  bucket_id = 'ai-2d-to-3d-models'
  and owner = auth.uid()
);

commit;

