create or replace function toggle_shopping_item_purchased(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from unit_shopping_items where id = p_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  update unit_shopping_items
  set is_purchased = not is_purchased,
      purchased_at = case when not is_purchased then now() else null end
  where id = p_id;
end;
$$;

create or replace function remove_shopping_item(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from unit_shopping_items where id = p_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  delete from unit_shopping_items where id = p_id;
end;
$$;

create or replace function clear_purchased_shopping_items(p_unit_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  delete from unit_shopping_items where unit_id = p_unit_id and is_purchased = true;
end;
$$;
