alter table app_verifications
add column if not exists permit_object_path text;
