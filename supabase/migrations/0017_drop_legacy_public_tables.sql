-- Legacy schema from migrations 0001–0007 (profiles, products, orders, etc.).
-- The application uses only app_* tables; these were never referenced by the Express API.

drop table if exists recommendation_events cascade;
drop table if exists orders cascade;
drop table if exists customization_options cascade;
drop table if exists products cascade;
drop table if exists seller_verification_submissions cascade;
drop table if exists seller_profiles cascade;
drop table if exists profiles cascade;
