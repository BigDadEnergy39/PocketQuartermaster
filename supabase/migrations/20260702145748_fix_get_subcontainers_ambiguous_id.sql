-- ============================================================
-- Fix: get_subcontainers declares `returns table (id uuid, ...)`,
-- which creates an implicit PL/pgSQL variable named `id` in the
-- function's own namespace. The lookup line
--   select unit_id into v_unit_id from containers where id = p_container_id;
-- left `id` unqualified, so Postgres couldn't tell whether it meant
-- that implicit return-row variable or containers.id, and raised at
-- runtime (not at CREATE FUNCTION time, since PL/pgSQL only resolves
-- this when the line actually executes):
--   ERROR 42702: column reference "id" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table
--   column.
-- get_containers never hit this because its lookup always qualifies
-- with the `c.` table alias. Fix: alias containers here too. Same
-- signature, so CREATE OR REPLACE is safe (no overload risk).
-- Confirmed live via isolated repro before and after this fix, and
-- via a direct PostgREST call reproducing the exact 400 the app saw.
-- ============================================================

create or replace function get_subcontainers(p_container_id uuid)
returns table (
  id         uuid,
  name       text,
  type       text,
  purpose    text,
  notes      text,
  item_count bigint
) language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select c.unit_id into v_unit_id from containers c where c.id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select
    c.id, c.name, c.type::text, c.purpose::text, c.notes,
    count(s.id) as item_count
  from containers c
  left join item_slots s on s.container_id = c.id
  where c.parent_container_id = p_container_id and c.is_archived = false
  group by c.id
  order by c.name;
end;
$$;
