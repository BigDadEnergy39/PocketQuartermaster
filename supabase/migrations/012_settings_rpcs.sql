-- Generate a new invite code for a unit (QMs only)
create or replace function generate_invite_code(
  p_unit_id  uuid,
  p_max_uses integer default null,
  p_expires_days integer default 7
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_code text;
begin
  if not is_unit_qm(p_unit_id) then
    raise exception 'Only Quartermasters can generate invite codes';
  end if;

  -- Generate a readable 8-char alphanumeric code
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into unit_invites (unit_id, code, created_by, expires_at, max_uses)
  values (
    p_unit_id,
    v_code,
    auth.uid(),
    case when p_expires_days is not null then now() + (p_expires_days || ' days')::interval else null end,
    p_max_uses
  );

  return v_code;
end;
$$;

-- Deactivate an invite code
create or replace function deactivate_invite_code(p_invite_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id uuid;
begin
  select unit_id into v_unit_id from unit_invites where id = p_invite_id;
  if not is_unit_qm(v_unit_id) then
    raise exception 'Only Quartermasters can deactivate invite codes';
  end if;
  update unit_invites set is_active = false where id = p_invite_id;
end;
$$;

-- Get active invite codes for a unit
create or replace function get_invite_codes(p_unit_id uuid)
returns table (
  id uuid,
  code text,
  use_count integer,
  max_uses integer,
  expires_at timestamptz,
  created_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select i.id, i.code, i.use_count, i.max_uses, i.expires_at, i.created_at
  from unit_invites i
  where i.unit_id = p_unit_id and i.is_active = true
  order by i.created_at desc;
end;
$$;

-- Get members of a unit
create or replace function get_unit_members(p_unit_id uuid)
returns table (
  user_id uuid,
  display_name text,
  role text,
  joined_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  return query
  select m.user_id, coalesce(p.display_name, u.email, 'Unknown') as display_name, m.role::text, m.joined_at
  from unit_members m
  join profiles p on p.id = m.user_id
  join auth.users u on u.id = m.user_id
  where m.unit_id = p_unit_id
  order by m.joined_at asc;
end;
$$;

-- Update unit name/color (QM only)
create or replace function update_unit(
  p_unit_id    uuid,
  p_name       text,
  p_accent_color text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_unit_qm(p_unit_id) then
    raise exception 'Only Quartermasters can update unit settings';
  end if;
  update units set name = p_name, accent_color = p_accent_color where id = p_unit_id;
end;
$$;
