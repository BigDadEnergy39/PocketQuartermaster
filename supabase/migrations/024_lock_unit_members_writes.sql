-- ============================================================
-- Close a privilege-escalation hole on unit_members
-- ------------------------------------------------------------
-- The members_insert policy used:
--     with check ((auth.uid() = user_id) OR is_unit_qm(unit_id))
-- The `auth.uid() = user_id` branch let ANY logged-in user insert a row
-- about THEMSELVES into ANY unit with ANY role -- including 'quartermaster' --
-- with no invite and no role/unit restriction. i.e. a direct API call:
--     insert into unit_members (unit_id, user_id, role)
--     values ('<any unit>', '<self>', 'quartermaster')
-- would make an attacker QM of a unit they were never invited to, granting
-- access to its inventory, member emails, and invite codes.
--
-- All LEGITIMATE membership writes go through security-definer RPCs that
-- bypass RLS:
--   * join_unit_by_code()  -> inserts role 'member' after validating a code
--   * create_unit()        -> inserts the creator as 'quartermaster'
--   * set_member_role()    -> changes roles with proper QM/last-QM checks
-- The client only ever READS unit_members directly (useUnits). So removing the
-- client-facing write policies closes the hole with no effect on the app:
-- direct INSERT/UPDATE/DELETE become default-deny, RPCs keep working.
-- (members_read stays.)
-- ============================================================

drop policy if exists "members_insert" on unit_members;
drop policy if exists "members_update" on unit_members;
drop policy if exists "members_delete" on unit_members;
