-- record_quantity was widened to accept p_notes via `create or replace function`
-- in 014_quantity_notes.sql, but that call added a new trailing parameter, so
-- Postgres created a second overload instead of replacing the original. Drop the
-- stale 2-arg overload so only the 3-arg (p_slot_id, p_quantity, p_notes) version
-- remains. See AGENTS.md "CREATE OR REPLACE overload gotcha".
drop function if exists record_quantity(uuid, integer);
