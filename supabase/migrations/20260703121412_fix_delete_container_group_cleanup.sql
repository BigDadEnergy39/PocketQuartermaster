-- ============================================================
-- Fix: delete_container archives a container but never checked its
-- link-group membership, so a deleted container kept a stale
-- group_id forever. It's invisible in every UI query (all of them
-- already filter is_archived = false), but diverge_container's
-- "how many members are left" count didn't filter archived rows
-- either, so a group could fail to auto-dissolve once only one
-- non-archived member remained.
-- ============================================================

create or replace function delete_container(p_container_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id   uuid;
  v_group_id  uuid;
  v_remaining int;
begin
  select unit_id, group_id into v_unit_id, v_group_id from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  -- Soft delete (archive) so history is preserved; leave its link group too.
  update containers set is_archived = true, group_id = null where id = p_container_id;

  if v_group_id is not null then
    select count(*) into v_remaining from containers where group_id = v_group_id and is_archived = false;

    if v_remaining <= 1 then
      if v_remaining = 1 then
        update containers set group_id = null where group_id = v_group_id and is_archived = false;
      end if;
      delete from container_groups where id = v_group_id;
    end if;
  end if;
end;
$$;

create or replace function diverge_container(p_container_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_unit_id   uuid;
  v_group_id  uuid;
  v_remaining int;
begin
  select unit_id, group_id into v_unit_id, v_group_id
  from containers where id = p_container_id;

  if not is_unit_member(v_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  if v_group_id is null then
    return;
  end if;

  update containers set group_id = null where id = p_container_id;

  select count(*) into v_remaining from containers where group_id = v_group_id and is_archived = false;

  if v_remaining <= 1 then
    if v_remaining = 1 then
      update containers set group_id = null where group_id = v_group_id and is_archived = false;
    end if;
    delete from container_groups where id = v_group_id;
  end if;
end;
$$;

-- One-time cleanup: clear stale group_id on containers archived before this
-- fix existed. Harmless (already excluded from every display query) but
-- keeps the new invariant (archived containers never carry a group_id)
-- consistent for existing data.
update containers set group_id = null where is_archived = true and group_id is not null;
