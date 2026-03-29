-- Product reviews (one per buyer per product) and buyer–seller direct messaging.
-- User FKs reference auth.users; public.app_users was removed in 0016_drop_app_users_fk_auth_users.sql.

create table if not exists public.app_product_reviews (
  id text primary key,
  product_id text not null references public.app_products (id) on delete cascade,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  rating integer not null check (rating >= 1 and rating <= 5),
  body text not null default '' check (char_length(body) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, buyer_id)
);

create index if not exists app_product_reviews_product_id_idx on public.app_product_reviews (product_id);
create index if not exists app_product_reviews_buyer_id_idx on public.app_product_reviews (buyer_id);

create table if not exists public.app_conversations (
  id text primary key,
  buyer_id uuid not null references auth.users (id) on delete cascade,
  seller_id uuid not null references auth.users (id) on delete cascade,
  updated_at timestamptz not null default now(),
  constraint app_conversations_distinct_participants check (buyer_id <> seller_id),
  unique (buyer_id, seller_id)
);

create index if not exists app_conversations_buyer_id_idx on public.app_conversations (buyer_id);
create index if not exists app_conversations_seller_id_idx on public.app_conversations (seller_id);

create table if not exists public.app_conversation_messages (
  id text primary key,
  conversation_id text not null references public.app_conversations (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists app_conversation_messages_conversation_id_idx
  on public.app_conversation_messages (conversation_id);
