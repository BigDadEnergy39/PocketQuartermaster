-- ============================================================
-- Restrict profile reads to the owner
-- ------------------------------------------------------------
-- Finding (2026-06 review, item #1 follow-up): profiles_read used
-- "using (true)", so any logged-in user could read every user's
-- display_name across all units.
--
-- The app only ever reads a user's OWN profile directly
-- (settings screen). All other-member name display goes through the
-- get_unit_members() security-definer RPC, which bypasses RLS — so
-- locking this down to the owner breaks nothing.
--
-- If a future feature needs to read other members' profiles directly,
-- replace the policy below with a "shares a unit with me" check, e.g.:
--   using (
--     id = auth.uid()
--     or exists (
--       select 1 from unit_members me
--       join unit_members them on them.unit_id = me.unit_id
--       where me.user_id = auth.uid() and them.user_id = profiles.id
--     )
--   )
-- ============================================================

drop policy if exists "profiles_read" on profiles;

create policy "profiles_read" on profiles
  for select using (auth.uid() = id);
