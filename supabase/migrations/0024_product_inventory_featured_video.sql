alter table if exists app_products
  add column if not exists made_to_order boolean not null default false,
  add column if not exists stock_quantity integer,
  add column if not exists is_featured boolean not null default false,
  add column if not exists video_url text;

comment on column app_products.made_to_order is 'When true, stock_quantity is unused; buyers may request custom colors.';
comment on column app_products.stock_quantity is 'Units in stock; required when made_to_order is false.';
comment on column app_products.is_featured is 'Surface on landing highlights when published.';
comment on column app_products.video_url is 'Single product video URL (max one per product).';

update app_products
set stock_quantity = coalesce(stock_quantity, 0)
where coalesce(made_to_order, false) = false;
