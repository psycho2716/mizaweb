create extension if not exists "uuid-ossp";

create table if not exists profiles (
  id uuid primary key default uuid_generate_v4(),
  auth_user_id uuid unique,
  role text not null check (role in ('buyer', 'seller', 'admin')),
  email text not null,
  created_at timestamptz not null default now()
);
