-- ============================================================
-- join_container_group: lets a container join an EXISTING linked
-- set directly (picking the group, not another container). Its
-- expected contents are overwritten to match the group's current
-- members, same as the "overwrite target from source" behavior in
-- link_containers — just entered from the joining container's side
-- instead of requiring you to start from an existing member.
-- ============================================================
create or replace function join_container_group(p_container_id uuid, p_group_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id       uuid;
  v_container_grp uuid;
  v_group_unit_id uuid;
  v_ref_id        uuid;
begin
  select unit_id, group_id into v_unit_id, v_container_grp from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  select unit_id into v_group_unit_id from container_groups where id = p_group_id;

  if v_group_unit_id is null or v_group_unit_id <> v_unit_id then
    raise exception 'Linked set is not in this unit';
  end if;

  if v_container_grp = p_group_id then
    return; -- already a member, nothing to do
  end if;

  if v_container_grp is not null then
    raise exception 'Container is already part of a different linked set; diverge it first';
  end if;

  update containers set group_id = p_group_id where id = p_container_id;

  -- Pick any existing active member as the reference to copy expected contents from.
  select id into v_ref_id
  from containers
  where group_id = p_group_id and id <> p_container_id and is_archived = false
  limit 1;

  if v_ref_id is null then
    return; -- no other active member to copy from (shouldn't normally happen)
  end if;

  delete from item_slots
  where container_id = p_container_id
    and item_id not in (select item_id from item_slots where container_id = v_ref_id);

  update item_slots t
  set expected_quantity = s.expected_quantity
  from item_slots s
  where s.container_id = v_ref_id
    and t.container_id = p_container_id
    and t.item_id = s.item_id
    and t.expected_quantity <> s.expected_quantity;

  insert into item_slots (container_id, item_id, expected_quantity)
  select p_container_id, s.item_id, s.expected_quantity
  from item_slots s
  where s.container_id = v_ref_id
    and not exists (
      select 1 from item_slots t
      where t.container_id = p_container_id and t.item_id = s.item_id
    );
end;
$$;

-- ============================================================
-- get_container_groups: lists a unit's existing linked sets, for
-- the "Join a Linked Set" picker.
-- ============================================================
create or replace function get_container_groups(p_unit_id uuid)
returns table (
  id           uuid,
  name         text,
  member_count bigint
) language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select g.id, g.name, count(c.id) as member_count
  from container_groups g
  join containers c on c.group_id = g.id and c.is_archived = false
  where g.unit_id = p_unit_id
  group by g.id
  order by g.name;
end;
$$;
