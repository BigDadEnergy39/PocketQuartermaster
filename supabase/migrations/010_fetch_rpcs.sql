-- RPC to fetch containers for a unit
create or replace function get_containers(p_unit_id uuid)
returns table (
  id uuid,
  name text,
  type text,
  purpose text,
  notes text,
  item_count bigint
) language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select
    c.id, c.name, c.type, c.purpose, c.notes,
    count(s.id) as item_count
  from containers c
  left join item_slots s on s.container_id = c.id
  where c.unit_id = p_unit_id and c.is_archived = false
  group by c.id
  order by c.name;
end;
$$;

-- RPC to fetch items in a container
create or replace function get_container_items(p_container_id uuid)
returns table (
  slot_id uuid,
  expected_quantity integer,
  current_quantity integer,
  last_updated_at timestamptz,
  item_id uuid,
  item_name text,
  category text,
  unit_of_measure text,
  min_quantity integer
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
    i.min_quantity
  from item_slots s
  join items i on i.id = s.item_id
  left join current_quantities cq on cq.slot_id = s.id
  where s.container_id = p_container_id
  order by i.name;
end;
$$;
