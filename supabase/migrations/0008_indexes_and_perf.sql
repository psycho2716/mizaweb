create index if not exists idx_products_created_at on products(created_at desc);
create index if not exists idx_products_published on products(is_published);
create index if not exists idx_recommendation_events_profile on recommendation_events(profile_id);
