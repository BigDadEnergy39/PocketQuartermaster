-- RPC to fetch shopping list (avoids RLS auth.uid() resolution issues on direct selects)
create or replace function get_shopping_list(p_unit_id uuid)
returns table (
  id uuid,
  item_id uuid,
  item_name text,
  quantity integer,
  unit_of_measure text,
  notes text,
  is_purchased boolean,
  created_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select
    s.id, s.item_id, s.item_name, s.quantity,
    s.unit_of_measure, s.notes, s.is_purchased, s.created_at
  from unit_shopping_items s
  where s.unit_id = p_unit_id
  order by s.is_purchased asc, s.created_at desc;
end;
$$;
