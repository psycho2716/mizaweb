create table if not exists app_user_credentials (
  user_id text primary key references app_users(id) on delete cascade,
  email text not null unique,
  password_hash text not null
);
