-- RLS for all application tables + storage.objects policies for verification-docs and product-media.
-- Backend uses the service role (bypasses RLS). Policies protect direct anon/authenticated PostgREST access.

-- ---------------------------------------------------------------------------
-- Helpers (invoker — safe in RLS; role comes from JWT user_metadata)
-- ---------------------------------------------------------------------------
create or replace function public.app_jwt_role()
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(trim(auth.jwt() -> 'user_metadata' ->> 'role'), ''), '');
$$;

create or replace function public.app_is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select public.app_jwt_role() = 'admin';
$$;

grant execute on function public.app_jwt_role() to anon, authenticated;
grant execute on function public.app_is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- app_seller_status: sellers read own; only admins mutate (approvals)
-- ---------------------------------------------------------------------------
alter table public.app_seller_status enable row level security;
alter table public.app_seller_status force row level security;

drop policy if exists "app_seller_status_select_own_or_admin" on public.app_seller_status;
create policy "app_seller_status_select_own_or_admin"
  on public.app_seller_status for select
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_seller_status_insert_admin" on public.app_seller_status;
create policy "app_seller_status_insert_admin"
  on public.app_seller_status for insert
  to authenticated
  with check (public.app_is_admin());

drop policy if exists "app_seller_status_update_admin" on public.app_seller_status;
create policy "app_seller_status_update_admin"
  on public.app_seller_status for update
  to authenticated
  using (public.app_is_admin())
  with check (public.app_is_admin());

drop policy if exists "app_seller_status_delete_admin" on public.app_seller_status;
create policy "app_seller_status_delete_admin"
  on public.app_seller_status for delete
  to authenticated
  using (public.app_is_admin());

-- ---------------------------------------------------------------------------
-- app_verifications: seller owns rows; admin full access
-- ---------------------------------------------------------------------------
alter table public.app_verifications enable row level security;
alter table public.app_verifications force row level security;

drop policy if exists "app_verifications_select" on public.app_verifications;
create policy "app_verifications_select"
  on public.app_verifications for select
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_verifications_insert" on public.app_verifications;
create policy "app_verifications_insert"
  on public.app_verifications for insert
  to authenticated
  with check (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_verifications_update" on public.app_verifications;
create policy "app_verifications_update"
  on public.app_verifications for update
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin())
  with check (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_verifications_delete" on public.app_verifications;
create policy "app_verifications_delete"
  on public.app_verifications for delete
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin());

-- ---------------------------------------------------------------------------
-- app_products: public published catalog; sellers manage own; admin all
-- ---------------------------------------------------------------------------
alter table public.app_products enable row level security;
alter table public.app_products force row level security;

drop policy if exists "app_products_select_public_or_owner_or_admin" on public.app_products;
create policy "app_products_select_public_or_owner_or_admin"
  on public.app_products for select
  to anon, authenticated
  using (
    is_published = true
    or seller_id = auth.uid()
    or public.app_is_admin()
  );

drop policy if exists "app_products_insert_seller_or_admin" on public.app_products;
create policy "app_products_insert_seller_or_admin"
  on public.app_products for insert
  to authenticated
  with check (
    public.app_is_admin()
    or (
      seller_id = auth.uid()
      and public.app_jwt_role() in ('seller', 'admin')
    )
  );

drop policy if exists "app_products_update_owner_or_admin" on public.app_products;
create policy "app_products_update_owner_or_admin"
  on public.app_products for update
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin())
  with check (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_products_delete_owner_or_admin" on public.app_products;
create policy "app_products_delete_owner_or_admin"
  on public.app_products for delete
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin());

-- ---------------------------------------------------------------------------
-- app_product_media: visible when parent product is published or owner/admin
-- ---------------------------------------------------------------------------
alter table public.app_product_media enable row level security;
alter table public.app_product_media force row level security;

drop policy if exists "app_product_media_select" on public.app_product_media;
create policy "app_product_media_select"
  on public.app_product_media for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.app_products p
      where p.id = app_product_media.product_id
        and (
          p.is_published = true
          or p.seller_id = auth.uid()
          or public.app_is_admin()
        )
    )
  );

drop policy if exists "app_product_media_insert" on public.app_product_media;
create policy "app_product_media_insert"
  on public.app_product_media for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_products p
      where p.id = product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  );

drop policy if exists "app_product_media_update" on public.app_product_media;
create policy "app_product_media_update"
  on public.app_product_media for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_products p
      where p.id = app_product_media.product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.app_products p
      where p.id = product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  );

drop policy if exists "app_product_media_delete" on public.app_product_media;
create policy "app_product_media_delete"
  on public.app_product_media for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_products p
      where p.id = app_product_media.product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- app_customization_options
-- ---------------------------------------------------------------------------
alter table public.app_customization_options enable row level security;
alter table public.app_customization_options force row level security;

drop policy if exists "app_customization_options_select" on public.app_customization_options;
create policy "app_customization_options_select"
  on public.app_customization_options for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.app_products p
      where p.id = app_customization_options.product_id
        and (
          p.is_published = true
          or p.seller_id = auth.uid()
          or public.app_is_admin()
        )
    )
  );

drop policy if exists "app_customization_options_insert" on public.app_customization_options;
create policy "app_customization_options_insert"
  on public.app_customization_options for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_products p
      where p.id = product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  );

drop policy if exists "app_customization_options_update" on public.app_customization_options;
create policy "app_customization_options_update"
  on public.app_customization_options for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_products p
      where p.id = app_customization_options.product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.app_products p
      where p.id = product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  );

drop policy if exists "app_customization_options_delete" on public.app_customization_options;
create policy "app_customization_options_delete"
  on public.app_customization_options for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_products p
      where p.id = app_customization_options.product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- app_customization_rules
-- ---------------------------------------------------------------------------
alter table public.app_customization_rules enable row level security;
alter table public.app_customization_rules force row level security;

drop policy if exists "app_customization_rules_select" on public.app_customization_rules;
create policy "app_customization_rules_select"
  on public.app_customization_rules for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.app_products p
      where p.id = app_customization_rules.product_id
        and (
          p.is_published = true
          or p.seller_id = auth.uid()
          or public.app_is_admin()
        )
    )
  );

drop policy if exists "app_customization_rules_insert" on public.app_customization_rules;
create policy "app_customization_rules_insert"
  on public.app_customization_rules for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.app_products p
      where p.id = product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  );

drop policy if exists "app_customization_rules_update" on public.app_customization_rules;
create policy "app_customization_rules_update"
  on public.app_customization_rules for update
  to authenticated
  using (
    exists (
      select 1
      from public.app_products p
      where p.id = app_customization_rules.product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  )
  with check (
    exists (
      select 1
      from public.app_products p
      where p.id = product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  );

drop policy if exists "app_customization_rules_delete" on public.app_customization_rules;
create policy "app_customization_rules_delete"
  on public.app_customization_rules for delete
  to authenticated
  using (
    exists (
      select 1
      from public.app_products p
      where p.id = app_customization_rules.product_id
        and (p.seller_id = auth.uid() or public.app_is_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- app_cart_items: only the buyer (or admin); guest rows have no client access
-- ---------------------------------------------------------------------------
alter table public.app_cart_items enable row level security;
alter table public.app_cart_items force row level security;

drop policy if exists "app_cart_items_select" on public.app_cart_items;
create policy "app_cart_items_select"
  on public.app_cart_items for select
  to authenticated
  using (buyer_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_cart_items_insert" on public.app_cart_items;
create policy "app_cart_items_insert"
  on public.app_cart_items for insert
  to authenticated
  with check (
    (buyer_id = auth.uid() and buyer_id is not null)
    or public.app_is_admin()
  );

drop policy if exists "app_cart_items_update" on public.app_cart_items;
create policy "app_cart_items_update"
  on public.app_cart_items for update
  to authenticated
  using (buyer_id = auth.uid() or public.app_is_admin())
  with check (buyer_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_cart_items_delete" on public.app_cart_items;
create policy "app_cart_items_delete"
  on public.app_cart_items for delete
  to authenticated
  using (buyer_id = auth.uid() or public.app_is_admin());

-- ---------------------------------------------------------------------------
-- app_orders: buyer and seller on the order; admin all
-- ---------------------------------------------------------------------------
alter table public.app_orders enable row level security;
alter table public.app_orders force row level security;

drop policy if exists "app_orders_select" on public.app_orders;
create policy "app_orders_select"
  on public.app_orders for select
  to authenticated
  using (
    buyer_id = auth.uid()
    or seller_id = auth.uid()
    or public.app_is_admin()
  );

drop policy if exists "app_orders_insert" on public.app_orders;
create policy "app_orders_insert"
  on public.app_orders for insert
  to authenticated
  with check (
    buyer_id = auth.uid()
    or public.app_is_admin()
  );

drop policy if exists "app_orders_update" on public.app_orders;
create policy "app_orders_update"
  on public.app_orders for update
  to authenticated
  using (
    buyer_id = auth.uid()
    or seller_id = auth.uid()
    or public.app_is_admin()
  )
  with check (
    buyer_id = auth.uid()
    or seller_id = auth.uid()
    or public.app_is_admin()
  );

drop policy if exists "app_orders_delete" on public.app_orders;
create policy "app_orders_delete"
  on public.app_orders for delete
  to authenticated
  using (public.app_is_admin());

-- ---------------------------------------------------------------------------
-- app_seller_profiles: approved storefronts readable; owners and admins write
-- ---------------------------------------------------------------------------
alter table public.app_seller_profiles enable row level security;
alter table public.app_seller_profiles force row level security;

drop policy if exists "app_seller_profiles_select" on public.app_seller_profiles;
create policy "app_seller_profiles_select"
  on public.app_seller_profiles for select
  to anon, authenticated
  using (
    seller_id = auth.uid()
    or public.app_is_admin()
    or exists (
      select 1
      from public.app_seller_status st
      where st.seller_id = app_seller_profiles.seller_id
        and st.status = 'approved'
    )
  );

drop policy if exists "app_seller_profiles_insert" on public.app_seller_profiles;
create policy "app_seller_profiles_insert"
  on public.app_seller_profiles for insert
  to authenticated
  with check (
    seller_id = auth.uid()
    or public.app_is_admin()
  );

drop policy if exists "app_seller_profiles_update" on public.app_seller_profiles;
create policy "app_seller_profiles_update"
  on public.app_seller_profiles for update
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin())
  with check (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_seller_profiles_delete" on public.app_seller_profiles;
create policy "app_seller_profiles_delete"
  on public.app_seller_profiles for delete
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin());

-- ---------------------------------------------------------------------------
-- app_order_messages: participants on the order + admin
-- ---------------------------------------------------------------------------
alter table public.app_order_messages enable row level security;
alter table public.app_order_messages force row level security;

drop policy if exists "app_order_messages_select" on public.app_order_messages;
create policy "app_order_messages_select"
  on public.app_order_messages for select
  to authenticated
  using (
    public.app_is_admin()
    or exists (
      select 1
      from public.app_orders o
      where o.id = app_order_messages.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
    )
  );

drop policy if exists "app_order_messages_insert" on public.app_order_messages;
create policy "app_order_messages_insert"
  on public.app_order_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and (
      public.app_is_admin()
      or exists (
        select 1
        from public.app_orders o
        where o.id = order_id
          and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
      )
    )
  );

drop policy if exists "app_order_messages_update" on public.app_order_messages;
create policy "app_order_messages_update"
  on public.app_order_messages for update
  to authenticated
  using (sender_id = auth.uid() or public.app_is_admin())
  with check (sender_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_order_messages_delete" on public.app_order_messages;
create policy "app_order_messages_delete"
  on public.app_order_messages for delete
  to authenticated
  using (sender_id = auth.uid() or public.app_is_admin());

-- ---------------------------------------------------------------------------
-- app_seller_payment_methods: seller + admin only (sensitive payout details)
-- ---------------------------------------------------------------------------
alter table public.app_seller_payment_methods enable row level security;
alter table public.app_seller_payment_methods force row level security;

drop policy if exists "app_seller_payment_methods_select" on public.app_seller_payment_methods;
create policy "app_seller_payment_methods_select"
  on public.app_seller_payment_methods for select
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_seller_payment_methods_insert" on public.app_seller_payment_methods;
create policy "app_seller_payment_methods_insert"
  on public.app_seller_payment_methods for insert
  to authenticated
  with check (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_seller_payment_methods_update" on public.app_seller_payment_methods;
create policy "app_seller_payment_methods_update"
  on public.app_seller_payment_methods for update
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin())
  with check (seller_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_seller_payment_methods_delete" on public.app_seller_payment_methods;
create policy "app_seller_payment_methods_delete"
  on public.app_seller_payment_methods for delete
  to authenticated
  using (seller_id = auth.uid() or public.app_is_admin());

-- ---------------------------------------------------------------------------
-- Storage: verification-docs (private) — first path segment = auth user id
-- (storage.objects RLS is managed by Supabase; do not ALTER here — migration role may not own it.)
-- ---------------------------------------------------------------------------
drop policy if exists "verification_docs_select_own_or_admin" on storage.objects;
create policy "verification_docs_select_own_or_admin"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and (
      public.app_is_admin()
      or split_part(name, '/', 1) = auth.uid()::text
    )
  );

drop policy if exists "verification_docs_insert_own_or_admin" on storage.objects;
create policy "verification_docs_insert_own_or_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'verification-docs'
    and (
      public.app_is_admin()
      or split_part(name, '/', 1) = auth.uid()::text
    )
  );

drop policy if exists "verification_docs_update_own_or_admin" on storage.objects;
create policy "verification_docs_update_own_or_admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and (
      public.app_is_admin()
      or split_part(name, '/', 1) = auth.uid()::text
    )
  )
  with check (
    bucket_id = 'verification-docs'
    and (
      public.app_is_admin()
      or split_part(name, '/', 1) = auth.uid()::text
    )
  );

drop policy if exists "verification_docs_delete_own_or_admin" on storage.objects;
create policy "verification_docs_delete_own_or_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'verification-docs'
    and (
      public.app_is_admin()
      or split_part(name, '/', 1) = auth.uid()::text
    )
  );

-- ---------------------------------------------------------------------------
-- Storage: product-media (public bucket) — world read; writes under own prefix
-- ---------------------------------------------------------------------------
drop policy if exists "product_media_public_select" on storage.objects;
create policy "product_media_public_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-media');

drop policy if exists "product_media_insert_own_or_admin" on storage.objects;
create policy "product_media_insert_own_or_admin"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-media'
    and (
      public.app_is_admin()
      or split_part(name, '/', 1) = auth.uid()::text
    )
  );

drop policy if exists "product_media_update_own_or_admin" on storage.objects;
create policy "product_media_update_own_or_admin"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-media'
    and (
      public.app_is_admin()
      or split_part(name, '/', 1) = auth.uid()::text
    )
  )
  with check (
    bucket_id = 'product-media'
    and (
      public.app_is_admin()
      or split_part(name, '/', 1) = auth.uid()::text
    )
  );

drop policy if exists "product_media_delete_own_or_admin" on storage.objects;
create policy "product_media_delete_own_or_admin"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-media'
    and (
      public.app_is_admin()
      or split_part(name, '/', 1) = auth.uid()::text
    )
  );
