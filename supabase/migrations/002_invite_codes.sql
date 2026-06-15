-- ============================================================
-- Unit invite codes
-- QMs generate a short code; anyone with it can join the unit
-- ============================================================

create table unit_invites (
  id          uuid primary key default gen_random_uuid(),
  unit_id     uuid not null references units(id) on delete cascade,
  code        text not null unique,
  created_by  uuid not null references profiles(id),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz,
  max_uses    integer,
  use_count   integer not null default 0,
  is_active   boolean not null default true
);

create index on unit_invites (code) where is_active = true;

alter table unit_invites enable row level security;

-- Anyone can look up an invite by code (to join)
create policy "invites_read_by_code" on unit_invites
  for select using (true);

-- Only QMs can create or deactivate invites
create policy "invites_insert" on unit_invites
  for insert with check (is_unit_qm(unit_id));

create policy "invites_update" on unit_invites
  for update using (is_unit_qm(unit_id));

-- Function to join a unit via invite code
create or replace function join_unit_by_code(invite_code text)
returns json language plpgsql security definer as $$
declare
  v_invite  unit_invites%rowtype;
  v_unit    units%rowtype;
begin
  -- Find active invite
  select * into v_invite
  from unit_invites
  where code = invite_code
    and is_active = true
    and (expires_at is null or expires_at > now())
    and (max_uses is null or use_count < max_uses);

  if not found then
    return json_build_object('error', 'Invalid or expired invite code');
  end if;

  -- Check not already a member
  if exists (
    select 1 from unit_members
    where unit_id = v_invite.unit_id and user_id = auth.uid()
  ) then
    return json_build_object('error', 'You are already a member of this unit');
  end if;

  -- Add member
  insert into unit_members (unit_id, user_id, role, invited_by)
  values (v_invite.unit_id, auth.uid(), 'member', v_invite.created_by);

  -- Increment use count
  update unit_invites set use_count = use_count + 1 where id = v_invite.id;

  -- Return the unit they joined
  select * into v_unit from units where id = v_invite.unit_id;
  return json_build_object('unit_id', v_unit.id, 'unit_name', v_unit.name);
end;
$$;
