-- Pending seller requests to change public shop map coordinates (admin approves).

create table if not exists public.app_seller_location_requests (
  id text primary key,
  seller_id uuid not null references auth.users (id) on delete cascade,
  requested_latitude double precision not null,
  requested_longitude double precision not null,
  previous_latitude double precision,
  previous_longitude double precision,
  note text,
  status text not null check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  rejection_reason text
);

create index if not exists app_seller_location_requests_seller_id_idx
  on public.app_seller_location_requests (seller_id);

create index if not exists app_seller_location_requests_status_idx
  on public.app_seller_location_requests (status);

alter table public.app_seller_location_requests enable row level security;
alter table public.app_seller_location_requests force row level security;

drop policy if exists "app_seller_location_requests_select" on public.app_seller_location_requests;
create policy "app_seller_location_requests_select"
  on public.app_seller_location_requests for select
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_seller_location_requests_insert" on public.app_seller_location_requests;
create policy "app_seller_location_requests_insert"
  on public.app_seller_location_requests for insert
  to authenticated
  with check (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_seller_location_requests_update" on public.app_seller_location_requests;
create policy "app_seller_location_requests_update"
  on public.app_seller_location_requests for update
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin())
  with check (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_seller_location_requests_delete" on public.app_seller_location_requests;
create policy "app_seller_location_requests_delete"
  on public.app_seller_location_requests for delete
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin());
