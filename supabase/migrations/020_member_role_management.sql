-- Member role management — let QMs change a member's role from Settings.
--
-- Rules (enforced here, the only safe place):
--   * Caller must be a QM or AQM to change any role.
--   * Granting OR removing the full `quartermaster` role requires the caller to
--     be a full `quartermaster` (an AQM cannot self-promote or demote the lead).
--   * A unit must always retain at least one `quartermaster`, so the last QM
--     cannot be demoted (this also covers a QM trying to step themselves down).
create or replace function set_member_role(
  p_unit_id uuid,
  p_user_id uuid,
  p_role    text
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_caller_role   unit_role;
  v_target_role   unit_role;
  v_new_role      unit_role;
  v_qm_count      integer;
begin
  -- Validate the requested role against the enum.
  begin
    v_new_role := p_role::unit_role;
  exception when invalid_text_representation then
    raise exception 'Invalid role: %', p_role;
  end;

  select role into v_caller_role
  from unit_members
  where unit_id = p_unit_id and user_id = auth.uid();

  if v_caller_role is null
     or v_caller_role not in ('quartermaster', 'assistant_quartermaster') then
    raise exception 'Only Quartermasters can change member roles';
  end if;

  select role into v_target_role
  from unit_members
  where unit_id = p_unit_id and user_id = p_user_id;

  if v_target_role is null then
    raise exception 'User is not a member of this unit';
  end if;

  -- Granting or removing the Quartermaster role is reserved for a full QM.
  if (v_new_role = 'quartermaster' or v_target_role = 'quartermaster')
     and v_caller_role <> 'quartermaster' then
    raise exception 'Only a Quartermaster can assign or change the Quartermaster role';
  end if;

  -- No-op.
  if v_target_role = v_new_role then
    return;
  end if;

  -- Never leave a unit without a Quartermaster.
  if v_target_role = 'quartermaster' and v_new_role <> 'quartermaster' then
    select count(*) into v_qm_count
    from unit_members
    where unit_id = p_unit_id and role = 'quartermaster';

    if v_qm_count <= 1 then
      raise exception 'A unit must have at least one Quartermaster';
    end if;
  end if;

  update unit_members
  set role = v_new_role
  where unit_id = p_unit_id and user_id = p_user_id;
end;
$$;
