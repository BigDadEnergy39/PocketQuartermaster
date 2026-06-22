-- Returns distinct item categories for a unit (for autocomplete)
create or replace function get_item_categories(p_unit_id uuid)
returns table(category text)
language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  return query
  select distinct i.category
  from items i
  where i.unit_id = p_unit_id and i.category is not null
  order by i.category;
end;
$$;
