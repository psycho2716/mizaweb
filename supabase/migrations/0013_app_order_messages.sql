create table if not exists app_order_messages (
  id text primary key,
  order_id text not null references app_orders(id) on delete cascade,
  sender_id text not null references app_users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);
