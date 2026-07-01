-- ─────────────────────────────────────────────────────────────
-- Mentara pre-launch website — database schema
-- Run once in Supabase → SQL Editor (or add to your migrations).
--
-- Two lists:
--   1. waitlist             → interested students
--   2. mentor_applications  → founding mentors (seed the supply side)
--
-- RLS is INSERT-only for the anon (public) key, so visitors can sign
-- up but NObody can read the lists back through the browser key.
-- You view/export them from the Supabase Table Editor (you're the owner).
-- ─────────────────────────────────────────────────────────────

-- ── 1. Student waitlist ──────────────────────────────────────
create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique
                check (char_length(email) between 3 and 254),
  interest    text check (interest is null or char_length(interest) <= 500),
  source      text default 'landing',
  created_at  timestamptz not null default now()
);

alter table public.waitlist enable row level security;

drop policy if exists "anon can join waitlist" on public.waitlist;
create policy "anon can join waitlist"
  on public.waitlist
  for insert
  to anon
  with check (true);

-- ── 2. Founding mentor applications ──────────────────────────
create table if not exists public.mentor_applications (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null unique
                check (char_length(email) between 3 and 254),
  expertise   text not null check (char_length(expertise) between 1 and 200),
  experience  text check (experience is null or char_length(experience) <= 1000),
  linkedin    text check (linkedin is null or char_length(linkedin) <= 300),
  source      text default 'landing',
  created_at  timestamptz not null default now()
);

alter table public.mentor_applications enable row level security;

drop policy if exists "anon can apply as mentor" on public.mentor_applications;
create policy "anon can apply as mentor"
  on public.mentor_applications
  for insert
  to anon
  with check (true);

-- ── Admin read access (for admin.html dashboard) ─────────────
-- Lets authenticated users (the founder) SELECT from both lists.
drop policy if exists "authenticated can read waitlist" on public.waitlist;
create policy "authenticated can read waitlist"
  on public.waitlist for select to authenticated using (true);

drop policy if exists "authenticated can read mentor_applications" on public.mentor_applications;
create policy "authenticated can read mentor_applications"
  on public.mentor_applications for select to authenticated using (true);

-- ── Exporting your signups later ─────────────────────────────
--   select email, created_at from public.waitlist order by created_at desc;
--   select name, email, expertise, experience, linkedin, created_at
--     from public.mentor_applications order by created_at desc;
