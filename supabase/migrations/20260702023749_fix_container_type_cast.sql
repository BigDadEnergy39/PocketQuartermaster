-- ============================================================
-- Fix: add_container / edit_container never cast their p_type /
-- p_purpose text parameters to the container_type / container_purpose
-- enums before assigning them to the containers table. Postgres does
-- not implicitly cast text-typed plpgsql variables into enum columns,
-- so both RPCs raised "column is of type container_type but
-- expression is of type text" on every call. Containers created via
-- duplicate_container were unaffected (it copies the enum column
-- directly), which is why this went unnoticed.
-- ============================================================

create or replace function add_container(
  p_unit_id     uuid,
  p_name        text,
  p_type        text,
  p_purpose     text,
  p_notes       text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  if exists (select 1 from containers where unit_id = p_unit_id and lower(name) = lower(p_name) and is_archived = false) then
    raise exception 'A container named "%" already exists in this unit', p_name;
  end if;

  insert into containers (unit_id, name, type, purpose, notes)
  values (p_unit_id, p_name, p_type::container_type, p_purpose::container_purpose, p_notes)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function edit_container(
  p_container_id uuid,
  p_name         text,
  p_type         text,
  p_purpose      text,
  p_notes        text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  -- Duplicate name check (exclude self)
  if exists (
    select 1 from containers
    where unit_id = v_unit_id
      and lower(name) = lower(p_name)
      and is_archived = false
      and id <> p_container_id
  ) then
    raise exception 'A container named "%" already exists in this unit', p_name;
  end if;

  update containers
  set name = p_name, type = p_type::container_type, purpose = p_purpose::container_purpose, notes = p_notes
  where id = p_container_id;
end;
$$;
