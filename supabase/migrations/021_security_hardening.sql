-- ============================================================
-- Security hardening
-- ------------------------------------------------------------
-- Addresses findings from the 2026-06 security review:
--   1. unit_invites was world-readable (any caller could enumerate
--      every invite code and join any unit).
--   2. current_quantities view bypassed RLS (cross-unit data leak).
--   3. get_unit_members leaked every member's email to all members.
--   4. early security-definer helpers had a mutable search_path.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Stop leaking invite codes.
--    The join flow uses the join_unit_by_code() security-definer RPC and
--    QMs list codes via get_invite_codes(), so the client never needs a
--    direct SELECT on unit_invites. Drop the "using (true)" policy that let
--    anyone (incl. the anon role) read every code in the database.
-- ------------------------------------------------------------
drop policy if exists "invites_read_by_code" on unit_invites;

-- ------------------------------------------------------------
-- 2. Make current_quantities honor the caller's RLS.
--    In PG15+ views default to security_invoker = off, so this view ran with
--    its owner's rights and bypassed RLS on item_quantities. Turning the
--    invoker check on makes it enforce the item_quantities policies, which
--    already gate access by unit membership.
-- ------------------------------------------------------------
alter view current_quantities set (security_invoker = on);

-- ------------------------------------------------------------
-- 3. Only expose member emails to Quartermasters.
--    Same signature/return type, so CREATE OR REPLACE is sufficient.
-- ------------------------------------------------------------
create or replace function get_unit_members(p_unit_id uuid)
returns table (
  user_id uuid,
  display_name text,
  role text,
  joined_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  v_is_qm boolean;
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  v_is_qm := is_unit_qm(p_unit_id);

  return query
  select
    m.user_id,
    coalesce(p.display_name, case when v_is_qm then u.email else null end, 'Unknown') as display_name,
    m.role::text,
    m.joined_at
  from unit_members m
  join profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.unit_id = p_unit_id
  order by m.joined_at asc;
end;
$$;

-- ------------------------------------------------------------
-- 4. Pin search_path on the early security-definer helpers.
--    Everything from migration 005 onward already does this; these three
--    predate that convention.
-- ------------------------------------------------------------
alter function is_unit_member(uuid) set search_path = public;
alter function is_unit_qm(uuid) set search_path = public;
alter function join_unit_by_code(text) set search_path = public;
