-- Delete an entire unit — the destructive companion to create_unit().
--
-- Units could previously only be created and joined, never removed, so
-- test/duplicate units accumulated with no way to clean them up. This adds the
-- missing delete path, following the app's security model: a security-definer
-- RPC that re-checks the caller's role with auth.uid() before touching anything.
--
-- Rules (enforced here, the only safe place):
--   * Caller must be a Quartermaster (or Assistant QM) of the unit, matched by
--     is_unit_qm(p_unit_id). Anyone else raises.
--   * On delete, every child row is removed by the ON DELETE CASCADE chain that
--     hangs off units(id):
--       unit_members, containers, items, audit_schedules, audit_records,
--       unit_shopping_items, shopping_category_types, unit_invites,
--       notification_prefs            -> direct  ... references units(id) on delete cascade
--       item_slots                    -> via items / containers cascade
--       item_quantities               -> via item_slots cascade
--       expiration_lots               -> via item_slots cascade
--       audit_line_items              -> via audit_records cascade
--       shopping_item_tags            -> via unit_shopping_items / shopping_category_types cascade
--     Every table that references units(id) declares ON DELETE CASCADE (verified
--     across migrations 001/002/004/016), so a single `delete from units` clears
--     the whole tree with nothing orphaned.
--
--     One subtlety: audit_line_items.slot_id references item_slots(id) with the
--     default NO ACTION (not cascade). That is safe here because the matching
--     audit_line_items rows are removed first via the audit_records cascade, and
--     NO ACTION is re-checked only at end-of-statement — by which point no
--     referencing rows remain. (RESTRICT would fail; NO ACTION does not.)
create or replace function delete_unit(p_unit_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_qm(p_unit_id) then
    raise exception 'Only a Quartermaster can delete a unit';
  end if;

  delete from units where id = p_unit_id;
end;
$$;
