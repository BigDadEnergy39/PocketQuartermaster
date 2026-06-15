-- Start a new audit, returns audit_id and all slots to audit
create or replace function start_audit(p_unit_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  insert into audit_records (unit_id, conducted_by)
  values (p_unit_id, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

-- Get all containers + slots to audit for a unit
create or replace function get_audit_items(p_unit_id uuid)
returns table (
  container_id   uuid,
  container_name text,
  container_type text,
  slot_id        uuid,
  item_name      text,
  category       text,
  unit_of_measure text,
  expected_quantity integer,
  current_quantity  integer,
  min_quantity      integer
) language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select
    c.id as container_id,
    c.name as container_name,
    c.type as container_type,
    s.id as slot_id,
    i.name as item_name,
    i.category,
    i.unit_of_measure,
    s.expected_quantity,
    cq.quantity as current_quantity,
    i.min_quantity
  from containers c
  join item_slots s on s.container_id = c.id
  join items i on i.id = s.item_id
  left join current_quantities cq on cq.slot_id = s.id
  where c.unit_id = p_unit_id and c.is_archived = false
  order by c.name, i.name;
end;
$$;

-- Record a single audit line item and update current_quantities
create or replace function record_audit_item(
  p_audit_id        uuid,
  p_slot_id         uuid,
  p_expected_qty    integer,
  p_actual_qty      integer,
  p_notes           text default null
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from audit_records where id = p_audit_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  -- Upsert audit line item
  insert into audit_line_items (audit_id, slot_id, expected_quantity, actual_quantity, is_present, notes)
  values (p_audit_id, p_slot_id, p_expected_qty, p_actual_qty, p_actual_qty > 0, p_notes)
  on conflict (audit_id, slot_id) do update
    set actual_quantity = p_actual_qty, is_present = p_actual_qty > 0, notes = p_notes;

  -- Update live quantity
  insert into item_quantities (slot_id, quantity, updated_by)
  values (p_slot_id, p_actual_qty, auth.uid());
end;
$$;

-- Complete the audit
create or replace function complete_audit(p_audit_id uuid, p_notes text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from audit_records where id = p_audit_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  update audit_records
  set completed_at = now(), notes = p_notes
  where id = p_audit_id;
end;
$$;

-- Unique constraint needed for upsert in record_audit_item
alter table audit_line_items
  drop constraint if exists audit_line_items_audit_slot_unique;

alter table audit_line_items
  add constraint audit_line_items_audit_slot_unique unique (audit_id, slot_id);
