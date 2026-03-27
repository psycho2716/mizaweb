alter table if exists app_seller_profiles
  drop column if exists payment_qr_url,
  drop column if exists payment_method_name,
  drop column if exists payment_account_name,
  drop column if exists payment_account_number;
