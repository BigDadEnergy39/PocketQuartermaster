-- ============================================================
-- MIGRATION 015: Expiration tracking + is_perishable flag
-- ============================================================

-- Add is_perishable to items
alter table items add column if not exists is_perishable boolean not null default false;

-- ============================================================
-- get_expiration_lots: active lots for a slot
-- ============================================================
create or replace function get_expiration_lots(p_slot_id uuid)
returns table (
  id              uuid,
  slot_id         uuid,
  quantity        integer,
  expiration_date date,
  added_at        timestamptz,
  days_until      integer
)
language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member((
    select i.unit_id from item_slots s join items i on i.id = s.item_id where s.id = p_slot_id
  )) then
    raise exception 'Not a member of this unit';
  end if;

  return query
    select
      l.id,
      l.slot_id,
      l.quantity,
      l.expiration_date,
      l.added_at,
      (l.expiration_date - current_date)::integer as days_until
    from expiration_lots l
    where l.slot_id = p_slot_id
      and l.is_cleared = false
    order by l.expiration_date asc;
end;
$$;

-- ============================================================
-- add_expiration_lot: log a new lot
-- ============================================================
create or replace function add_expiration_lot(
  p_slot_id       uuid,
  p_expiration_date date,
  p_quantity      integer
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
  v_lot_id  uuid;
begin
  select i.unit_id into v_unit_id
    from item_slots s join items i on i.id = s.item_id where s.id = p_slot_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  insert into expiration_lots (slot_id, quantity, expiration_date, added_by)
  values (p_slot_id, p_quantity, p_expiration_date, auth.uid())
  returning id into v_lot_id;

  return v_lot_id;
end;
$$;

-- ============================================================
-- clear_expiration_lot: mark a lot as used/cleared
-- ============================================================
create or replace function clear_expiration_lot(p_lot_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member((
    select i.unit_id
    from expiration_lots l
    join item_slots s on s.id = l.slot_id
    join items i on i.id = s.item_id
    where l.id = p_lot_id
  )) then
    raise exception 'Not a member of this unit';
  end if;

  update expiration_lots set is_cleared = true where id = p_lot_id;
end;
$$;

-- ============================================================
-- set_item_perishable: toggle is_perishable on an item
-- ============================================================
create or replace function set_item_perishable(p_item_id uuid, p_perishable boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member((select unit_id from items where id = p_item_id)) then
    raise exception 'Not a member of this unit';
  end if;

  update items set is_perishable = p_perishable where id = p_item_id;
end;
$$;
