-- ============================================================
-- CONTAINER PROFILE EXPORT / IMPORT
-- ------------------------------------------------------------
-- Lets a QM export their unit's *container profile* (the
-- structure — containers, subcontainers, linked sets, the item
-- catalog, and expected quantities) as one JSON document, and
-- import someone else's to bootstrap a brand-new unit fast. This
-- is template-only: current counted quantities and expiration
-- lots are deliberately excluded (a Contents Check fills those in
-- afterward). The JSON doubles as a plain-file backup of the
-- profile.
--
-- Why a *normalized* shape (items in their own array, referenced
-- by ref from slots) rather than denormalizing item data onto
-- each slot: items are a UNIT-LEVEL shared catalog — one item can
-- sit in many containers, and min_quantity is a single
-- floor-across-all-containers for that item. Denormalizing would
-- recreate the same item once per slot on import, duplicating the
-- catalog and multiplying the min-quantity floor. Exporting items
-- once and wiring slots to them by ref reproduces the catalog
-- faithfully.
--
-- Refs in the export are just the source row UUIDs (opaque, not
-- secrets, and never reused as real ids on import — they only
-- wire relationships within the file). Import always mints fresh
-- ids in the target unit.
--
-- Both RPCs are security definer / set search_path = public, in
-- line with the app's rule that all access re-checks membership
-- with auth.uid() (see AGENTS.md). Import is QM-gated; a whole
-- profile is a lot to graft onto a unit, so it matches the
-- QM-only invite/settings surface. Import is additive and never
-- overwrites: PostgREST runs each RPC in one transaction, so any
-- error rolls the whole import back — the unit is never left with
-- a half-grafted profile.
-- ============================================================

-- ------------------------------------------------------------
-- export_container_profile: returns the whole active profile of a
-- unit as one jsonb document. Read-only; any member may export.
-- Only non-archived containers/items are included (archived rows
-- are hidden everywhere else in the app too, and an archived item
-- referenced by a slot would leave a dangling itemRef).
-- ------------------------------------------------------------
create or replace function export_container_profile(p_unit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not is_unit_member(p_unit_id) then
    raise exception 'Not a member of this unit';
  end if;

  select jsonb_build_object(
    'schemaVersion', 1,
    'kind', 'pocketquartermaster.container-profile',
    'exportedAt', now(),
    'sourceUnitName', (select u.name from units u where u.id = p_unit_id),

    -- Unit-level item catalog. Referenced by `ref` from slots below.
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ref', i.id,
        'name', i.name,
        'category', i.category,
        'unitOfMeasure', i.unit_of_measure,
        'minQuantity', i.min_quantity,
        'minQuantityPerPerson', i.min_quantity_per_person,
        'notes', i.notes
      ) order by i.name), '[]'::jsonb)
      from items i
      where i.unit_id = p_unit_id and i.is_archived = false
    ),

    -- Linked sets. Only export a group that still has at least one
    -- active member, so import never creates an empty linked set.
    'groups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ref', g.id,
        'name', g.name
      ) order by g.name), '[]'::jsonb)
      from container_groups g
      where g.unit_id = p_unit_id
        and exists (
          select 1 from containers c
          where c.group_id = g.id and c.is_archived = false
        )
    ),

    -- Containers, flat with parentRef, so subcontainers map cleanly
    -- back to the containers table on import (which nests via
    -- parent_container_id). Top-level first for readability.
    'containers', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ref', c.id,
        'parentRef', c.parent_container_id,
        'groupRef', c.group_id,
        'name', c.name,
        'type', c.type::text,
        'purpose', c.purpose::text,
        'notes', c.notes,
        'slots', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'itemRef', s.item_id,
            'expectedQuantity', s.expected_quantity,
            'notes', s.notes
          ) order by s.id), '[]'::jsonb)
          from item_slots s
          join items si on si.id = s.item_id
          where s.container_id = c.id and si.is_archived = false
        )
      ) order by (c.parent_container_id is not null), c.name), '[]'::jsonb)
      from containers c
      where c.unit_id = p_unit_id and c.is_archived = false
    )
  ) into v_result;

  return v_result;
end;
$$;

-- ------------------------------------------------------------
-- import_container_profile: grafts a profile onto p_unit_id.
-- QM-only. Additive + always-create-new: every row is a brand-new
-- row in the target unit; nothing existing is touched or merged.
-- Top-level container names get a " (Imported)" suffix only when
-- they collide with an existing (or already-imported) name, so a
-- clean import into an empty unit keeps names verbatim.
--
-- ref -> new-id maps are kept as in-function jsonb objects (no
-- temp tables): source ref string -> new uuid (stored as text).
-- ------------------------------------------------------------
create or replace function import_container_profile(p_unit_id uuid, p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_map  jsonb := '{}'::jsonb;  -- source item ref  -> new item id  (text)
  v_group_map jsonb := '{}'::jsonb;  -- source group ref -> new group id (text)
  v_cont_map  jsonb := '{}'::jsonb;  -- source cont ref  -> new cont id  (text)
  v_elem      jsonb;
  v_slot      jsonb;
  v_new_id    uuid;
  v_group_id  uuid;
  v_parent_id uuid;
  v_item_id   uuid;
  v_base      text;
  v_name      text;
  v_suffix_n  int;
  v_item_count  int := 0;
  v_group_count int := 0;
  v_cont_count  int := 0;
  v_slot_count  int := 0;
begin
  -- Never trust the client's claim: only a QM of THIS unit imports.
  if not is_unit_qm(p_unit_id) then
    raise exception 'Only a quartermaster can import a container profile';
  end if;

  if p_profile is null or jsonb_typeof(p_profile) <> 'object' then
    raise exception 'Invalid container profile';
  end if;

  if p_profile->>'kind' is distinct from 'pocketquartermaster.container-profile' then
    raise exception 'This file is not a PocketQuartermaster container profile';
  end if;

  -- Fail fast on an unknown schema rather than silently mis-reading a
  -- future file format. Bump this + add a migration path when the shape changes.
  if p_profile->>'schemaVersion' is distinct from '1' then
    raise exception 'Unsupported container profile version (expected 1, got %)',
      coalesce(p_profile->>'schemaVersion', 'none');
  end if;

  -- ----- items (unit-level catalog) -----
  for v_elem in select value from jsonb_array_elements(coalesce(p_profile->'items', '[]'::jsonb)) loop
    insert into items (unit_id, name, category, unit_of_measure, min_quantity, min_quantity_per_person, notes)
    values (
      p_unit_id,
      coalesce(nullif(trim(v_elem->>'name'), ''), 'Imported item'),
      v_elem->>'category',
      coalesce(nullif(v_elem->>'unitOfMeasure', ''), 'each'),
      (v_elem->>'minQuantity')::int,
      (v_elem->>'minQuantityPerPerson')::numeric,
      v_elem->>'notes'
    )
    returning id into v_new_id;
    v_item_map := v_item_map || jsonb_build_object(v_elem->>'ref', v_new_id::text);
    v_item_count := v_item_count + 1;
  end loop;

  -- ----- linked sets (groups) -----
  for v_elem in select value from jsonb_array_elements(coalesce(p_profile->'groups', '[]'::jsonb)) loop
    insert into container_groups (unit_id, name)
    values (p_unit_id, coalesce(nullif(trim(v_elem->>'name'), ''), 'Imported set'))
    returning id into v_new_id;
    v_group_map := v_group_map || jsonb_build_object(v_elem->>'ref', v_new_id::text);
    v_group_count := v_group_count + 1;
  end loop;

  -- ----- top-level containers (parentRef absent) -----
  -- Must run before subcontainers so a child's parent already exists.
  for v_elem in
    select value from jsonb_array_elements(coalesce(p_profile->'containers', '[]'::jsonb))
    where value->>'parentRef' is null
  loop
    v_base := coalesce(nullif(trim(v_elem->>'name'), ''), 'Imported container');
    v_name := v_base;
    v_suffix_n := 0;
    -- Suffix only on a real collision (checks the live table, so it also
    -- disambiguates two same-named containers within this same import).
    while exists (
      select 1 from containers c
      where c.unit_id = p_unit_id and c.parent_container_id is null
        and c.is_archived = false and lower(c.name) = lower(v_name)
    ) loop
      v_suffix_n := v_suffix_n + 1;
      v_name := v_base || case when v_suffix_n = 1 then ' (Imported)'
                               else ' (Imported ' || v_suffix_n || ')' end;
    end loop;

    v_group_id := null;
    if v_elem->>'groupRef' is not null then
      v_group_id := nullif(v_group_map->>(v_elem->>'groupRef'), '')::uuid;
    end if;

    insert into containers (unit_id, name, type, purpose, notes, group_id)
    values (
      p_unit_id,
      v_name,
      coalesce(nullif(v_elem->>'type', ''), 'tote')::container_type,
      coalesce(nullif(v_elem->>'purpose', ''), 'camping')::container_purpose,
      v_elem->>'notes',
      v_group_id
    )
    returning id into v_new_id;
    v_cont_map := v_cont_map || jsonb_build_object(v_elem->>'ref', v_new_id::text);
    v_cont_count := v_cont_count + 1;

    for v_slot in select value from jsonb_array_elements(coalesce(v_elem->'slots', '[]'::jsonb)) loop
      v_item_id := nullif(v_item_map->>(v_slot->>'itemRef'), '')::uuid;
      if v_item_id is not null then
        insert into item_slots (container_id, item_id, expected_quantity, notes)
        values (v_new_id, v_item_id, coalesce((v_slot->>'expectedQuantity')::int, 0), v_slot->>'notes')
        on conflict (item_id, container_id) do nothing;
        v_slot_count := v_slot_count + 1;
      end if;
    end loop;
  end loop;

  -- ----- subcontainers (parentRef present) -----
  for v_elem in
    select value from jsonb_array_elements(coalesce(p_profile->'containers', '[]'::jsonb))
    where value->>'parentRef' is not null
  loop
    v_parent_id := nullif(v_cont_map->>(v_elem->>'parentRef'), '')::uuid;
    if v_parent_id is null then
      continue;  -- parent missing/filtered; skip the orphan rather than abort the whole import
    end if;

    -- Subcontainer names are naturally repeated across parents ("Fire Kit"
    -- in every box), so they are NOT suffixed — the collision suffix is only
    -- to disambiguate visible top-level containers. Groups don't apply to
    -- subcontainers, so group_id is left null here.
    insert into containers (unit_id, name, type, purpose, notes, parent_container_id)
    values (
      p_unit_id,
      coalesce(nullif(trim(v_elem->>'name'), ''), 'Imported subcontainer'),
      coalesce(nullif(v_elem->>'type', ''), 'tote')::container_type,
      coalesce(nullif(v_elem->>'purpose', ''), 'camping')::container_purpose,
      v_elem->>'notes',
      v_parent_id
    )
    returning id into v_new_id;
    v_cont_map := v_cont_map || jsonb_build_object(v_elem->>'ref', v_new_id::text);
    v_cont_count := v_cont_count + 1;

    for v_slot in select value from jsonb_array_elements(coalesce(v_elem->'slots', '[]'::jsonb)) loop
      v_item_id := nullif(v_item_map->>(v_slot->>'itemRef'), '')::uuid;
      if v_item_id is not null then
        insert into item_slots (container_id, item_id, expected_quantity, notes)
        values (v_new_id, v_item_id, coalesce((v_slot->>'expectedQuantity')::int, 0), v_slot->>'notes')
        on conflict (item_id, container_id) do nothing;
        v_slot_count := v_slot_count + 1;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'containers', v_cont_count,
    'items', v_item_count,
    'groups', v_group_count,
    'slots', v_slot_count
  );
end;
$$;
