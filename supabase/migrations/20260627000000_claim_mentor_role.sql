-- ─────────────────────────────────────────────────────────────
-- claim_mentor_role()
-- Lets a freshly signed-up user (e.g. via Google/Apple OAuth on mentara.me)
-- set their OWN role to 'mentor'.
--
-- Why this is needed: the `profiles` RLS UPDATE policy intentionally blocks
-- client-side role changes (anti-elevation), and OAuth signups can't pass a
-- `role` into handle_new_user the way email/password signups can, so an OAuth
-- signup always lands as the default 'student'. This function is the one
-- controlled, auditable way to flip a brand-new account to 'mentor'.
--
-- Safe by design:
--   • SECURITY DEFINER with a fixed search_path (no search_path hijacking).
--   • Only ever sets role to 'mentor' (never an arbitrary value).
--   • Only touches the caller's own row (auth.uid()), and only while it's
--     still the default 'student', so it can't disturb established accounts.
--   • Role is self-selected at signup anyway, so this grants no privilege a
--     normal mentor signup wouldn't already have.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_mentor_role()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
     SET role = 'mentor',
         signup_source = 'web'
   WHERE id = auth.uid()
     AND role = 'student';
END;
$$;

REVOKE ALL ON FUNCTION public.claim_mentor_role() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.claim_mentor_role() TO authenticated;
