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
