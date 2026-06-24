# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Database & Security Rules (read before touching the schema)

This app's data security rests **entirely on Postgres Row Level Security**. The
`authenticated` role has broad table grants, so RLS is the *only* thing gating
logged-in users. Follow these rules without exception:

1. **Every new table gets RLS + policies.** Immediately after `create table`,
   add `alter table <name> enable row level security;` and at least one
   membership-scoped policy (`is_unit_member(unit_id)` / `is_unit_qm(unit_id)`),
   matching the existing tables. CI (`scripts/check-rls.mjs`) fails the build if
   a created table has no RLS.
2. **All writes (and most reads) go through `security definer` RPCs**, and every
   RPC must (a) `set search_path = public` and (b) re-check membership/role with
   `auth.uid()` before doing anything. Never trust a client-supplied user id —
   always use `auth.uid()` for actor columns.
3. **Never use `using (true)`** on a SELECT/ALL policy. Start from default-deny
   and allow only the specific people who should have access.
4. **The repo is authoritative.** Apply schema changes only via migration files
   (Supabase CLI), never by pasting into the SQL Editor — otherwise the database
   drifts from the repo and audits go stale.
5. **Client uses the anon key only.** The `service_role` key must never appear in
   the app, `.env*`, or EAS env. Secrets stay out of git (`.env*.local`,
   `gradle.properties`, `*.keystore` are gitignored).

# Migration Workflow (Supabase CLI)

The database is managed **exclusively** through the Supabase CLI and the migrations
in `supabase/migrations/`. The repo is the source of truth: a given commit's
migrations describe the schema that commit's code expects, so a fresh
`supabase db push` reproduces a compatible database.

- **Never** paste DDL/DML into the Supabase SQL Editor for schema changes — that
  silently drifts the live DB from the repo. (This caused real bugs here: tables
  live without RLS, a policy changed out-of-band.)
- **New change:** `supabase migration new <name>` → edit the generated
  `supabase/migrations/<timestamp>_<name>.sql` → `supabase db push` to apply it to
  the linked project (which records it in the remote migration ledger).
- **Inspect / sync:** `supabase migration list` shows local-vs-remote; if the DB
  ever drifts, `supabase db pull` captures the live schema as a migration.
- The `001`–`024` files predate CLI adoption; they were **baselined** as
  already-applied (marked in the ledger, never re-run). New migrations are
  timestamp-named and sort after them.
- Project/auth settings the repo can't express in SQL (e.g. `enable_signup = false`)
  belong in `supabase/config.toml`, also version-controlled.
- CI (`scripts/check-rls.mjs`) blocks any migration that creates a table without RLS.
