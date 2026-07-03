-- ============================================================
-- Fix: get_containers and get_subcontainers both declare
-- `type text, purpose text` in their RETURNS TABLE, but select
-- c.type/c.purpose directly, which are the container_type/
-- container_purpose ENUM columns. RETURN QUERY requires an exact
-- type match (no implicit enum->text coercion), so every call
-- raised:
--   ERROR 42804: structure of query does not match function result type
--   DETAIL: Returned type container_type does not match expected
--   type text in column N.
-- get_containers took down the entire container list for every
-- user; get_subcontainers took down the Subcontainers section on
-- every container detail screen. The get_containers bug predates
-- this migration (already present in the container_groups rewrite);
-- get_subcontainers is a fresh mistake in the same migration that
-- introduced it. Both fixes just add explicit ::text casts. Same
-- signatures throughout, so CREATE OR REPLACE is safe (no overload
-- risk). Confirmed live via isolated repros (throwaway functions
-- bypassing is_unit_member) before and after this fix.
-- ============================================================

create or replace function get_containers(p_unit_id uuid)
returns table (
  id                 uuid,
  name               text,
  type               text,
  purpose            text,
  notes              text,
  item_count         bigint,
  group_id           uuid,
  group_name         text,
  subcontainer_count bigint
) language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select
    c.id, c.name, c.type::text, c.purpose::text, c.notes,
    count(distinct s.id) as item_count,
    c.group_id,
    g.name as group_name,
    count(distinct sub.id) as subcontainer_count
  from containers c
  left join item_slots s on s.container_id = c.id
  left join container_groups g on g.id = c.group_id
  left join containers sub on sub.parent_container_id = c.id and sub.is_archived = false
  where c.unit_id = p_unit_id and c.is_archived = false and c.parent_container_id is null
  group by c.id, g.name
  order by c.name;
end;
$$;

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
  select unit_id into v_unit_id from containers where id = p_container_id;

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
