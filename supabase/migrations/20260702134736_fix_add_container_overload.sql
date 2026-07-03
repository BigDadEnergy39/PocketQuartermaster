-- ============================================================
-- Fix: 20260702112822_subcontainers.sql added an optional trailing
-- p_parent_container_id parameter to add_container via
-- `create or replace function`. Postgres treats a changed argument
-- LIST (5 params -> 6 params) as a distinct overload rather than a
-- replacement, so the original 5-arg add_container from migration
-- 005 was left live alongside the new 6-arg one. Any call passing
-- exactly the original 5 named arguments (e.g. the pre-subcontainers
-- "Add Container" screen) became ambiguous between the two overloads
-- and failed with "could not choose the best candidate function."
-- Confirmed live via `supabase db query --linked`.
-- ============================================================

drop function if exists add_container(uuid, text, text, text, text);
