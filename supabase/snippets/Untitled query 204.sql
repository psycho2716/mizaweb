-- Exact shop location for seller storefronts (map pin at registration / profile).
alter table if exists app_seller_profiles
  add column if not exists shop_latitude double precision;

alter table if exists app_seller_profiles
  add column if not exists shop_longitude double precision;
