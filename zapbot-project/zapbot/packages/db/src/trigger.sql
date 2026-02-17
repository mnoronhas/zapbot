-- =============================================================================
-- ZapBot: Auto-create account row when a new user registers via Supabase Auth
-- =============================================================================
--
-- WHEN TO RUN: After running database migrations (pnpm db:migrate) so the
--              public.accounts table exists.
--
-- WHERE TO RUN: Supabase Dashboard -> SQL Editor -> New Query -> paste this
--               entire file and click "Run".
--
-- WHAT IT DOES: Creates a PostgreSQL trigger on auth.users (Supabase-managed)
--               that fires after every new user registration. The trigger
--               inserts a corresponding row into public.accounts so every
--               authenticated user has an account automatically.
--
-- BUSINESS_NAME FALLBACK: If the signup metadata contains a "business_name"
--               field, it is used. Otherwise, the part before '@' in the
--               user's email is used as a placeholder (e.g., "maria" from
--               "maria@clinica.com").
--
-- IDEMPOTENT: Safe to re-run — drops existing trigger before recreating.
-- =============================================================================

-- 1. Create (or replace) the trigger function
-- SECURITY DEFINER is required because the function executes in the auth
-- schema context but must INSERT into public.accounts.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.accounts (
    supabase_user_id,
    email,
    business_name
  ) VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'business_name',
      split_part(NEW.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Drop existing trigger if re-running this script
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Create the trigger (fires once per new row in auth.users)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
