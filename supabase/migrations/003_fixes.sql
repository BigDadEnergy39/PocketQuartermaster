-- ============================================================
-- Fixes applied during initial testing
-- ============================================================

-- Fix 1: Safer handle_new_user trigger
-- Original failed with 500 on signup due to search_path issue
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Fix 2: Grant permissions to authenticated role
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant all on all sequences in schema public to authenticated;

-- Fix 3: Looser units insert policy (auth.uid() passed server-side via RPC)
drop policy if exists "units_insert" on units;
create policy "units_insert" on units
  for insert
  with check (auth.uid() is not null);

-- Fix 4: create_unit RPC — handles insert server-side to avoid RLS auth.uid() issues
create or replace function create_unit(unit_name text, unit_color text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_unit units%rowtype;
begin
  insert into units (name, accent_color, created_by)
  values (unit_name, unit_color, auth.uid())
  returning * into v_unit;

  insert into unit_members (unit_id, user_id, role)
  values (v_unit.id, auth.uid(), 'quartermaster');

  return json_build_object('unit_id', v_unit.id, 'unit_name', v_unit.name);
end;
$$;
