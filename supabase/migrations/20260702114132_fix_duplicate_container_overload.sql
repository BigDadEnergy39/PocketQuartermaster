-- ============================================================
-- Fix: the container_groups migration's `create or replace function
-- duplicate_container(p_container_id, p_new_name, p_keep_linked default
-- false)` added a third parameter, which Postgres treats as a distinct
-- function signature rather than a replacement of the original two-
-- argument version. Both `duplicate_container(uuid,text)` and
-- `duplicate_container(uuid,text,boolean)` ended up coexisting, so any
-- call with exactly two arguments (the original "Duplicate Container"
-- button) failed with "could not choose the best candidate function."
-- Drop the stale two-argument overload; the three-argument version
-- (with p_keep_linked defaulting to false) covers the same behavior.
-- ============================================================

drop function if exists duplicate_container(uuid, text);
