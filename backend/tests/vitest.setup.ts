/**
 * Run before any test file so in-memory auth + legacy JWT are used (no live Supabase).
 * Keys include "replace" so integrations/supabase/client treats them as placeholders.
 */
process.env.NODE_ENV = "test";

process.env.SUPABASE_URL = "http://localhost";
process.env.SUPABASE_ANON_KEY = "replace_test_anon_key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "replace_test_service_role";
