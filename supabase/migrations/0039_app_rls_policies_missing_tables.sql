-- Ensure all app tables have RLS enabled + forced, then add missing policies.
-- This covers tables introduced after 0027_app_rls_and_storage_policies.sql.

-- ---------------------------------------------------------------------------
-- 1) Safety pass: enable + force RLS for every public.app_% table
-- ---------------------------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename like 'app\_%' escape '\'
  loop
    execute format('alter table public.%I enable row level security;', t.tablename);
    execute format('alter table public.%I force row level security;', t.tablename);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) app_product_reviews
--    - Read: visible when product is published; owner/admin can still read.
--    - Write: buyer owns their own review row; admin override.
-- ---------------------------------------------------------------------------
drop policy if exists "app_product_reviews_select_public_or_owner_or_admin"
  on public.app_product_reviews;
create policy "app_product_reviews_select_public_or_owner_or_admin"
  on public.app_product_reviews for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.app_products p
      where p.id = app_product_reviews.product_id
        and (
          p.is_published = true
          or p.seller_id = auth.uid()
          or public.app_is_admin()
        )
    )
    or app_product_reviews.buyer_id = auth.uid()
    or public.app_is_admin()
  );

drop policy if exists "app_product_reviews_insert_buyer_or_admin"
  on public.app_product_reviews;
create policy "app_product_reviews_insert_buyer_or_admin"
  on public.app_product_reviews for insert
  to authenticated
  with check (
    public.app_is_admin()
    or (
      app_product_reviews.buyer_id = auth.uid()
      and public.app_jwt_role() in ('buyer', 'admin')
    )
  );

drop policy if exists "app_product_reviews_update_owner_or_admin"
  on public.app_product_reviews;
create policy "app_product_reviews_update_owner_or_admin"
  on public.app_product_reviews for update
  to authenticated
  using (app_product_reviews.buyer_id = auth.uid() or public.app_is_admin())
  with check (app_product_reviews.buyer_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_product_reviews_delete_owner_or_admin"
  on public.app_product_reviews;
create policy "app_product_reviews_delete_owner_or_admin"
  on public.app_product_reviews for delete
  to authenticated
  using (app_product_reviews.buyer_id = auth.uid() or public.app_is_admin());

-- ---------------------------------------------------------------------------
-- 3) app_conversations
--    - Buyer/seller participants can read/manage their own rows.
--    - Admin can manage all rows.
-- ---------------------------------------------------------------------------
drop policy if exists "app_conversations_select_participant_or_admin"
  on public.app_conversations;
create policy "app_conversations_select_participant_or_admin"
  on public.app_conversations for select
  to authenticated
  using (
    app_conversations.buyer_id = auth.uid()
    or app_conversations.seller_id = auth.uid()
    or public.app_is_admin()
  );

drop policy if exists "app_conversations_insert_participant_or_admin"
  on public.app_conversations;
create policy "app_conversations_insert_participant_or_admin"
  on public.app_conversations for insert
  to authenticated
  with check (
    public.app_is_admin()
    or (
      app_conversations.buyer_id = auth.uid()
      and public.app_jwt_role() in ('buyer', 'admin')
    )
    or (
      app_conversations.seller_id = auth.uid()
      and public.app_jwt_role() in ('seller', 'admin')
    )
  );

drop policy if exists "app_conversations_update_participant_or_admin"
  on public.app_conversations;
create policy "app_conversations_update_participant_or_admin"
  on public.app_conversations for update
  to authenticated
  using (
    app_conversations.buyer_id = auth.uid()
    or app_conversations.seller_id = auth.uid()
    or public.app_is_admin()
  )
  with check (
    app_conversations.buyer_id = auth.uid()
    or app_conversations.seller_id = auth.uid()
    or public.app_is_admin()
  );

drop policy if exists "app_conversations_delete_participant_or_admin"
  on public.app_conversations;
create policy "app_conversations_delete_participant_or_admin"
  on public.app_conversations for delete
  to authenticated
  using (
    app_conversations.buyer_id = auth.uid()
    or app_conversations.seller_id = auth.uid()
    or public.app_is_admin()
  );

-- ---------------------------------------------------------------------------
-- 4) app_conversation_messages
--    - Read: conversation participants/admin.
--    - Insert: sender must be auth user and a participant/admin.
--    - Update/Delete: sender/admin.
-- ---------------------------------------------------------------------------
drop policy if exists "app_conversation_messages_select_participant_or_admin"
  on public.app_conversation_messages;
create policy "app_conversation_messages_select_participant_or_admin"
  on public.app_conversation_messages for select
  to authenticated
  using (
    public.app_is_admin()
    or exists (
      select 1
      from public.app_conversations c
      where c.id = app_conversation_messages.conversation_id
        and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
    )
  );

drop policy if exists "app_conversation_messages_insert_sender_participant_or_admin"
  on public.app_conversation_messages;
create policy "app_conversation_messages_insert_sender_participant_or_admin"
  on public.app_conversation_messages for insert
  to authenticated
  with check (
    public.app_is_admin()
    or (
      app_conversation_messages.sender_id = auth.uid()
      and exists (
        select 1
        from public.app_conversations c
        where c.id = app_conversation_messages.conversation_id
          and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
      )
    )
  );

drop policy if exists "app_conversation_messages_update_sender_or_admin"
  on public.app_conversation_messages;
create policy "app_conversation_messages_update_sender_or_admin"
  on public.app_conversation_messages for update
  to authenticated
  using (app_conversation_messages.sender_id = auth.uid() or public.app_is_admin())
  with check (app_conversation_messages.sender_id = auth.uid() or public.app_is_admin());

drop policy if exists "app_conversation_messages_delete_sender_or_admin"
  on public.app_conversation_messages;
create policy "app_conversation_messages_delete_sender_or_admin"
  on public.app_conversation_messages for delete
  to authenticated
  using (app_conversation_messages.sender_id = auth.uid() or public.app_is_admin());

-- ---------------------------------------------------------------------------
-- 5) app_order_line_items
--    - Read: buyer/seller participants of the parent order, or admin.
--    - Mutate: admin only (app backend uses service role for writes).
-- ---------------------------------------------------------------------------
drop policy if exists "app_order_line_items_select_participant_or_admin"
  on public.app_order_line_items;
create policy "app_order_line_items_select_participant_or_admin"
  on public.app_order_line_items for select
  to authenticated
  using (
    public.app_is_admin()
    or exists (
      select 1
      from public.app_orders o
      where o.id = app_order_line_items.order_id
        and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
    )
  );

drop policy if exists "app_order_line_items_insert_admin"
  on public.app_order_line_items;
create policy "app_order_line_items_insert_admin"
  on public.app_order_line_items for insert
  to authenticated
  with check (public.app_is_admin());

drop policy if exists "app_order_line_items_update_admin"
  on public.app_order_line_items;
create policy "app_order_line_items_update_admin"
  on public.app_order_line_items for update
  to authenticated
  using (public.app_is_admin())
  with check (public.app_is_admin());

drop policy if exists "app_order_line_items_delete_admin"
  on public.app_order_line_items;
create policy "app_order_line_items_delete_admin"
  on public.app_order_line_items for delete
  to authenticated
  using (public.app_is_admin());
