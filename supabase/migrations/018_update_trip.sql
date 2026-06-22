create or replace function update_trip(
  p_trip_id     uuid,
  p_name        text,
  p_trip_date   date,
  p_return_date date default null,
  p_headcount   integer default null,
  p_notes       text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_unit_id uuid;
begin
  select unit_id into v_unit_id from trips where id = p_trip_id;
  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;
  update trips
  set name = p_name, trip_date = p_trip_date, return_date = p_return_date,
      headcount = p_headcount, notes = p_notes
  where id = p_trip_id;
end;
$$;
