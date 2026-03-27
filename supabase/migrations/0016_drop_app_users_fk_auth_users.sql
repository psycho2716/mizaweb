-- Remove redundant public.app_users: identity + role live in auth.users (metadata).
-- All former app_users FKs now reference auth.users(id) directly.

alter table app_seller_status drop constraint if exists app_seller_status_seller_id_fkey;
alter table app_seller_status
  add constraint app_seller_status_seller_id_fkey
  foreign key (seller_id) references auth.users (id) on delete cascade;

alter table app_verifications drop constraint if exists app_verifications_seller_id_fkey;
alter table app_verifications
  add constraint app_verifications_seller_id_fkey
  foreign key (seller_id) references auth.users (id) on delete cascade;

alter table app_products drop constraint if exists app_products_seller_id_fkey;
alter table app_products
  add constraint app_products_seller_id_fkey
  foreign key (seller_id) references auth.users (id) on delete cascade;

alter table app_cart_items drop constraint if exists app_cart_items_buyer_id_fkey;
alter table app_cart_items
  add constraint app_cart_items_buyer_id_fkey
  foreign key (buyer_id) references auth.users (id) on delete cascade;

alter table app_orders drop constraint if exists app_orders_buyer_id_fkey;
alter table app_orders
  add constraint app_orders_buyer_id_fkey
  foreign key (buyer_id) references auth.users (id) on delete cascade;

alter table app_orders drop constraint if exists app_orders_seller_id_fkey;
alter table app_orders
  add constraint app_orders_seller_id_fkey
  foreign key (seller_id) references auth.users (id) on delete cascade;

alter table app_seller_profiles drop constraint if exists app_seller_profiles_seller_id_fkey;
alter table app_seller_profiles
  add constraint app_seller_profiles_seller_id_fkey
  foreign key (seller_id) references auth.users (id) on delete cascade;

alter table app_order_messages drop constraint if exists app_order_messages_sender_id_fkey;
alter table app_order_messages
  add constraint app_order_messages_sender_id_fkey
  foreign key (sender_id) references auth.users (id) on delete cascade;

drop table if exists app_users;
