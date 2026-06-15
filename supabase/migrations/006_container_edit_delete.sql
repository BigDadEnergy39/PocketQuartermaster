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
  set name = p_name, type = p_type, purpose = p_purpose, notes = p_notes
  where id = p_container_id;
end;
$$;

create or replace function delete_container(p_container_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  -- Soft delete (archive) so history is preserved
  update containers set is_archived = true where id = p_container_id;
end;
$$;
