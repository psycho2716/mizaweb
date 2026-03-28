-- Ensure 3D model URL column exists (fixes DBs that skipped 0018 or were created from partial migrations).
alter table if exists app_products
  add column if not exists model_3d_url text;

comment on column app_products.model_3d_url is 'Public URL for optional GLB/3D listing asset.';
