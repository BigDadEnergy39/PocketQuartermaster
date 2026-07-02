-- ============================================================
-- CONTAINER GROUPS ("linked sets")
-- Lets multiple containers share expected contents (item_slots)
-- while keeping actual counted quantities fully independent.
-- ============================================================

create table container_groups (
  id         uuid primary key default gen_random_uuid(),
  unit_id    uuid not null references units(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

alter table container_groups enable row level security;

create policy "container_groups_all" on container_groups
  using (is_unit_member(unit_id)) with check (is_unit_member(unit_id));

create index on container_groups (unit_id);

alter table containers add column group_id uuid references container_groups(id) on delete set null;

create index on containers (group_id);

-- ============================================================
-- duplicate_container: adds an optional "keep linked" mode.
-- Same behavior as before when p_keep_linked is false/omitted.
-- ============================================================
create or replace function duplicate_container(
  p_container_id uuid,
  p_new_name     text,
  p_keep_linked  boolean default false
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_unit_id  uuid;
  v_new_id   uuid;
  v_group_id uuid;
  v_src_name text;
begin
  select unit_id, name, group_id into v_unit_id, v_src_name, v_group_id
  from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  if p_keep_linked then
    if v_group_id is null then
      insert into container_groups (unit_id, name)
      values (v_unit_id, v_src_name)
      returning id into v_group_id;

      update containers set group_id = v_group_id where id = p_container_id;
    end if;
  else
    v_group_id := null;
  end if;

  -- Copy the container
  insert into containers (unit_id, name, type, purpose, notes, group_id)
  select unit_id, p_new_name, type, purpose, notes, v_group_id
  from containers where id = p_container_id
  returning id into v_new_id;

  -- Copy all item slots (without quantity history)
  insert into item_slots (container_id, item_id, expected_quantity)
  select v_new_id, item_id, expected_quantity
  from item_slots where container_id = p_container_id;

  return v_new_id;
end;
$$;

-- ============================================================
-- link_containers: joins one or more existing containers to the
-- source's linked set (creating one if the source isn't in one
-- yet), overwriting each target's expected contents to match the
-- source. Quantity history for items already in both is untouched.
-- ============================================================
create or replace function link_containers(
  p_source_container_id  uuid,
  p_target_container_ids uuid[],
  p_group_name           text default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_unit_id      uuid;
  v_src_name     text;
  v_group_id     uuid;
  v_target_id    uuid;
  v_target_unit  uuid;
  v_target_group uuid;
begin
  select unit_id, name, group_id into v_unit_id, v_src_name, v_group_id
  from containers where id = p_source_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  if v_group_id is null then
    insert into container_groups (unit_id, name)
    values (v_unit_id, coalesce(nullif(trim(p_group_name), ''), v_src_name))
    returning id into v_group_id;

    update containers set group_id = v_group_id where id = p_source_container_id;
  elsif p_group_name is not null and trim(p_group_name) <> '' then
    update container_groups set name = trim(p_group_name) where id = v_group_id;
  end if;

  foreach v_target_id in array p_target_container_ids loop
    if v_target_id = p_source_container_id then
      continue;
    end if;

    select unit_id, group_id into v_target_unit, v_target_group
    from containers where id = v_target_id;

    if v_target_unit is null or v_target_unit <> v_unit_id then
      raise exception 'Container % is not in this unit', v_target_id;
    end if;

    if v_target_group is not null and v_target_group <> v_group_id then
      raise exception 'Container % is already part of a different linked set; diverge it first', v_target_id;
    end if;

    update containers set group_id = v_group_id where id = v_target_id;

    -- Drop items the source doesn't have (cascades away their quantity/expiration history)
    delete from item_slots
    where container_id = v_target_id
      and item_id not in (
        select item_id from item_slots where container_id = p_source_container_id
      );

    -- Sync expected_quantity on items both already share (quantity history untouched)
    update item_slots t
    set expected_quantity = s.expected_quantity
    from item_slots s
    where s.container_id = p_source_container_id
      and t.container_id = v_target_id
      and t.item_id = s.item_id
      and t.expected_quantity <> s.expected_quantity;

    -- Add items the target is missing
    insert into item_slots (container_id, item_id, expected_quantity)
    select v_target_id, s.item_id, s.expected_quantity
    from item_slots s
    where s.container_id = p_source_container_id
      and not exists (
        select 1 from item_slots t
        where t.container_id = v_target_id and t.item_id = s.item_id
      );
  end loop;

  return v_group_id;
end;
$$;

-- ============================================================
-- diverge_container: removes one container from its linked set.
-- Its current item_slots are left exactly as-is. If that leaves
-- the set with one or zero members, the set itself is cleaned up.
-- ============================================================
create or replace function diverge_container(p_container_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id   uuid;
  v_group_id  uuid;
  v_remaining int;
begin
  select unit_id, group_id into v_unit_id, v_group_id
  from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  if v_group_id is null then
    return;
  end if;

  update containers set group_id = null where id = p_container_id;

  select count(*) into v_remaining from containers where group_id = v_group_id;

  if v_remaining <= 1 then
    if v_remaining = 1 then
      update containers set group_id = null where group_id = v_group_id;
    end if;
    delete from container_groups where id = v_group_id;
  end if;
end;
$$;

-- ============================================================
-- rename_container_group
-- ============================================================
create or replace function rename_container_group(p_group_id uuid, p_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from container_groups where id = p_group_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  if trim(p_name) = '' then
    raise exception 'Name cannot be empty';
  end if;

  update container_groups set name = trim(p_name) where id = p_group_id;
end;
$$;

-- ============================================================
-- get_container_group_members
-- ============================================================
create or replace function get_container_group_members(p_group_id uuid)
returns table (
  id         uuid,
  name       text,
  type       text,
  purpose    text,
  item_count bigint
) language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from container_groups where id = p_group_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select c.id, c.name, c.type, c.purpose, count(s.id) as item_count
  from containers c
  left join item_slots s on s.container_id = c.id
  where c.group_id = p_group_id and c.is_archived = false
  group by c.id
  order by c.name;
end;
$$;

-- ============================================================
-- add_item_to_container: now propagates new items to linked
-- siblings (same item, same expected quantity).
-- ============================================================
create or replace function add_item_to_container(
  p_container_id     uuid,
  p_item_name        text,
  p_category         text default null,
  p_unit_of_measure  text default 'each',
  p_expected_qty     integer default 1,
  p_min_qty          integer default null,
  p_existing_item_id uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_unit_id  uuid;
  v_item_id  uuid;
  v_slot_id  uuid;
  v_group_id uuid;
begin
  select unit_id, group_id into v_unit_id, v_group_id from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  if p_existing_item_id is not null then
    v_item_id := p_existing_item_id;
  else
    insert into items (unit_id, name, category, unit_of_measure)
    values (v_unit_id, p_item_name, p_category, p_unit_of_measure)
    returning id into v_item_id;
  end if;

  insert into item_slots (container_id, item_id, expected_quantity)
  values (p_container_id, v_item_id, p_expected_qty)
  returning id into v_slot_id;

  if p_min_qty is not null then
    update items set min_quantity = p_min_qty where id = v_item_id;
  end if;

  if v_group_id is not null then
    insert into item_slots (container_id, item_id, expected_quantity)
    select c.id, v_item_id, p_expected_qty
    from containers c
    where c.group_id = v_group_id and c.id <> p_container_id
    on conflict (item_id, container_id) do update set expected_quantity = excluded.expected_quantity;
  end if;

  return v_slot_id;
end;
$$;

-- ============================================================
-- edit_item_slot: now propagates expected_quantity changes to
-- linked siblings' matching slot. Item catalog fields (name,
-- category, etc.) already live on the shared unit-level item.
-- ============================================================
create or replace function edit_item_slot(
  p_slot_id         uuid,
  p_item_name       text,
  p_category        text default null,
  p_unit_of_measure text default 'each',
  p_expected_qty    integer default 1,
  p_min_qty         integer default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id      uuid;
  v_item_id      uuid;
  v_container_id uuid;
  v_group_id     uuid;
begin
  select i.unit_id, i.id, s.container_id into v_unit_id, v_item_id, v_container_id
  from item_slots s
  join items i on i.id = s.item_id
  where s.id = p_slot_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  update items
  set name = p_item_name, category = p_category, unit_of_measure = p_unit_of_measure, min_quantity = p_min_qty
  where id = v_item_id;

  update item_slots
  set expected_quantity = p_expected_qty
  where id = p_slot_id;

  select group_id into v_group_id from containers where id = v_container_id;

  if v_group_id is not null then
    update item_slots t
    set expected_quantity = p_expected_qty
    from containers c
    where t.container_id = c.id
      and c.group_id = v_group_id
      and c.id <> v_container_id
      and t.item_id = v_item_id;
  end if;
end;
$$;

-- ============================================================
-- remove_item_from_container: now removes the same item from
-- linked siblings too.
-- ============================================================
create or replace function remove_item_from_container(p_slot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id      uuid;
  v_item_id      uuid;
  v_container_id uuid;
  v_group_id     uuid;
begin
  select i.unit_id, s.item_id, s.container_id into v_unit_id, v_item_id, v_container_id
  from item_slots s
  join items i on i.id = s.item_id
  where s.id = p_slot_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  select group_id into v_group_id from containers where id = v_container_id;

  delete from item_slots where id = p_slot_id;

  if v_group_id is not null then
    delete from item_slots t
    using containers c
    where t.container_id = c.id
      and c.group_id = v_group_id
      and c.id <> v_container_id
      and t.item_id = v_item_id;
  end if;
end;
$$;

-- ============================================================
-- get_containers: now also returns group_id/group_name so the
-- UI can show a "Linked" badge. Return type changed (new output
-- columns), so drop first — CREATE OR REPLACE can't do that.
-- ============================================================
drop function if exists get_containers(uuid);

create function get_containers(p_unit_id uuid)
returns table (
  id         uuid,
  name       text,
  type       text,
  purpose    text,
  notes      text,
  item_count bigint,
  group_id   uuid,
  group_name text
) language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select
    c.id, c.name, c.type, c.purpose, c.notes,
    count(s.id) as item_count,
    c.group_id,
    g.name as group_name
  from containers c
  left join item_slots s on s.container_id = c.id
  left join container_groups g on g.id = c.group_id
  where c.unit_id = p_unit_id and c.is_archived = false
  group by c.id, g.name
  order by c.name;
end;
$$;
