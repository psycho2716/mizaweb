create table if not exists seller_profiles (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid not null references profiles(id) on delete cascade,
  verification_status text not null default 'unsubmitted'
    check (verification_status in ('unsubmitted','pending','approved','rejected')),
  rejection_reason text,
  verified_at timestamptz
);

create table if not exists seller_verification_submissions (
  id uuid primary key default uuid_generate_v4(),
  seller_profile_id uuid not null references seller_profiles(id) on delete cascade,
  permit_file_path text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
