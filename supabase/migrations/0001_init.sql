create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  role text not null check (role in ('buyer', 'seller', 'admin')),
  email text not null,
  created_at timestamptz not null default now()
);
