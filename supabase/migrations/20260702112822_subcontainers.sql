-- ============================================================
-- SUBCONTAINERS (one-level nesting)
-- Lets a container (e.g. a patrol box) hold subcontainers
-- (e.g. a tool kit, a fire kit), each with their own item_slots.
-- Nesting is capped at one level deep.
-- ============================================================

alter table containers add column parent_container_id uuid references containers(id) on delete cascade;

create index on containers (parent_container_id);

-- ============================================================
-- One-level guard: a subcontainer can't itself have a parent
-- assigned to it, and a container that already has children
-- can't become a subcontainer.
-- ============================================================
create or replace function enforce_container_one_level_nesting()
returns trigger language plpgsql as $$
begin
  if new.parent_container_id is not null then
    if new.parent_container_id = new.id then
      raise exception 'A container cannot be its own subcontainer';
    end if;

    if exists (
      select 1 from containers
      where id = new.parent_container_id and parent_container_id is not null
    ) then
      raise exception 'Subcontainers cannot be nested more than one level deep';
    end if;

    if exists (
      select 1 from containers where parent_container_id = new.id
    ) then
      raise exception 'A container with subcontainers cannot itself become a subcontainer';
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_container_one_level
  before insert or update of parent_container_id on containers
  for each row execute procedure enforce_container_one_level_nesting();

-- ============================================================
-- add_container: now accepts an optional parent_container_id
-- to create a subcontainer.
-- ============================================================
create or replace function add_container(
  p_unit_id              uuid,
  p_name                 text,
  p_type                 text,
  p_purpose              text,
  p_notes                text default null,
  p_parent_container_id  uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_parent_unit_id uuid;
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  if p_parent_container_id is not null then
    select unit_id into v_parent_unit_id from containers where id = p_parent_container_id;

    if v_parent_unit_id is null or v_parent_unit_id <> p_unit_id then
      raise exception 'Parent container is not in this unit';
    end if;
  end if;

  if exists (select 1 from containers where unit_id = p_unit_id and lower(name) = lower(p_name) and is_archived = false) then
    raise exception 'A container named "%" already exists in this unit', p_name;
  end if;

  insert into containers (unit_id, name, type, purpose, notes, parent_container_id)
  values (p_unit_id, p_name, p_type::container_type, p_purpose::container_purpose, p_notes, p_parent_container_id)
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================
-- get_containers: now excludes subcontainers (nested-only
-- visibility) and reports how many subcontainers each container
-- has. Return type changed, so drop first.
-- ============================================================
drop function if exists get_containers(uuid);

create function get_containers(p_unit_id uuid)
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
    c.id, c.name, c.type, c.purpose, c.notes,
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

-- ============================================================
-- get_subcontainers: the containers nested directly inside a
-- given parent container. Powers the collapsible subcontainer
-- cards on the parent's detail screen.
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
  select unit_id into v_unit_id from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select
    c.id, c.name, c.type, c.purpose, c.notes,
    count(s.id) as item_count
  from containers c
  left join item_slots s on s.container_id = c.id
  where c.parent_container_id = p_container_id and c.is_archived = false
  group by c.id
  order by c.name;
end;
$$;

-- ============================================================
-- get_container_check_items: a container's own items plus every
-- direct subcontainer's items, flattened into one list for the
-- Contents Check walkthrough. subcontainer_id/subcontainer_name
-- are null for the parent's own items.
-- ============================================================
create or replace function get_container_check_items(p_container_id uuid)
returns table (
  slot_id            uuid,
  expected_quantity  integer,
  current_quantity   integer,
  last_updated_at    timestamptz,
  item_id            uuid,
  item_name          text,
  category           text,
  unit_of_measure    text,
  min_quantity       integer,
  subcontainer_id    uuid,
  subcontainer_name  text
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
    s.id as slot_id,
    s.expected_quantity,
    cq.quantity as current_quantity,
    cq.updated_at as last_updated_at,
    i.id as item_id,
    i.name as item_name,
    i.category,
    i.unit_of_measure,
    i.min_quantity,
    c.subcontainer_id,
    c.subcontainer_name
  from (
    select p_container_id as container_id, null::uuid as subcontainer_id, null::text as subcontainer_name
    union all
    select sub.id, sub.id, sub.name
    from containers sub
    where sub.parent_container_id = p_container_id and sub.is_archived = false
  ) c
  join item_slots s on s.container_id = c.container_id
  join items i on i.id = s.item_id
  left join current_quantities cq on cq.slot_id = s.id
  order by c.subcontainer_name nulls first, i.name;
end;
$$;

-- ============================================================
-- delete_container: soft-delete now cascades to subcontainers.
-- ============================================================
create or replace function delete_container(p_container_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  -- Soft delete (archive) so history is preserved; cascades to subcontainers
  update containers
  set is_archived = true
  where id = p_container_id or parent_container_id = p_container_id;
end;
$$;

-- ============================================================
-- duplicate_container: now also copies parent_container_id
-- (duplicating a subcontainer keeps it under the same parent),
-- and cascades the copy to any direct subcontainers of the
-- source, each with their own copied item_slots.
-- ============================================================
create or replace function duplicate_container(
  p_container_id uuid,
  p_new_name     text,
  p_keep_linked  boolean default false
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_unit_id    uuid;
  v_new_id     uuid;
  v_group_id   uuid;
  v_src_name   text;
  v_sub        record;
  v_new_sub_id uuid;
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
  insert into containers (unit_id, name, type, purpose, notes, group_id, parent_container_id)
  select unit_id, p_new_name, type, purpose, notes, v_group_id, parent_container_id
  from containers where id = p_container_id
  returning id into v_new_id;

  -- Copy all item slots (without quantity history)
  insert into item_slots (container_id, item_id, expected_quantity)
  select v_new_id, item_id, expected_quantity
  from item_slots where container_id = p_container_id;

  -- Copy direct subcontainers (one level) and their item slots
  for v_sub in select * from containers where parent_container_id = p_container_id and is_archived = false loop
    insert into containers (unit_id, name, type, purpose, notes, parent_container_id)
    values (v_sub.unit_id, v_sub.name, v_sub.type, v_sub.purpose, v_sub.notes, v_new_id)
    returning id into v_new_sub_id;

    insert into item_slots (container_id, item_id, expected_quantity)
    select v_new_sub_id, item_id, expected_quantity
    from item_slots where container_id = v_sub.id;
  end loop;

  return v_new_id;
end;
$$;
