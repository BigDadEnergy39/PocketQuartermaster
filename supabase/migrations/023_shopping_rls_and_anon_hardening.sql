-- ============================================================
-- RLS for shopping category/tag tables + anon grant hardening
-- ------------------------------------------------------------
-- Audit finding (2026-06): shopping_category_types and
-- shopping_item_tags (migration 016) were created without RLS or
-- policies. On the live database RLS was later enabled by hand, so they
-- are currently default-deny and safe -- but the migration files never
-- enabled it, so a rebuild from migrations would bring them back with
-- RLS OFF and (given the broad grant to `authenticated`) wide open.
-- This makes the protection reproducible and adds explicit,
-- membership-scoped policies matching the rest of the schema.
-- ============================================================

-- shopping_category_types: unit-scoped directly via unit_id.
alter table shopping_category_types enable row level security;

drop policy if exists "shopping_category_types_all" on shopping_category_types;
create policy "shopping_category_types_all" on shopping_category_types
  using (is_unit_member(unit_id))
  with check (is_unit_member(unit_id));

-- shopping_item_tags: scoped through the parent shopping item's unit.
-- (trip_item_id is dead since trips were removed in migration 019; a
-- null unit_item_id yields a null unit and is therefore denied.)
alter table shopping_item_tags enable row level security;

drop policy if exists "shopping_item_tags_all" on shopping_item_tags;
create policy "shopping_item_tags_all" on shopping_item_tags
  using (
    is_unit_member((select unit_id from unit_shopping_items where id = unit_item_id))
  )
  with check (
    is_unit_member((select unit_id from unit_shopping_items where id = unit_item_id))
  );

-- ------------------------------------------------------------
-- Hardening: the logged-out `anon` role has no legitimate need to touch
-- any application table (the app requires sign-in for all data). It
-- currently holds only non-DML leftovers (TRUNCATE/REFERENCES/TRIGGER)
-- that aren't reachable through the REST API, but a logged-out role
-- should own nothing. Revoke them.
-- ------------------------------------------------------------
revoke all on all tables in schema public from anon;
