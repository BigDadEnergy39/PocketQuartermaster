#!/usr/bin/env node
// CI guard: every table created in a migration must have Row Level Security
// enabled somewhere in the migrations (and ideally at least one policy).
//
// Rationale: Supabase grants the `authenticated` role broad table access, so
// RLS is the ONLY thing gating logged-in users. A table created without
// `enable row level security` is wide open to every signed-in user. This
// check keeps that mistake from reaching the database.
//
// Usage: node scripts/check-rls.mjs
// Exits non-zero (and lists offenders) if any created-and-not-dropped table
// is missing RLS.

import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

const norm = (name) =>
  name.toLowerCase().replace(/"/g, '').replace(/^public\./, '').replace(/[(;].*$/, '').trim();

const created = new Map(); // table -> first migration file that created it
const rlsEnabled = new Set();
const dropped = new Set();
const withPolicy = new Set();

const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8');

  for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)/gi)) {
    const t = norm(m[1]);
    if (!created.has(t)) created.set(t, file);
  }
  for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?([\w."]+)\s+enable\s+row\s+level\s+security/gi)) {
    rlsEnabled.add(norm(m[1]));
  }
  for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?([\w."]+)/gi)) {
    dropped.add(norm(m[1]));
  }
  for (const m of sql.matchAll(/create\s+policy\s+[^\n]+?\son\s+([\w."]+)/gi)) {
    withPolicy.add(norm(m[1]));
  }
}

const missingRls = [];
const missingPolicy = [];
for (const [table, file] of created) {
  if (dropped.has(table)) continue; // table was removed; don't require RLS
  if (!rlsEnabled.has(table)) missingRls.push(`${table}  (created in ${file})`);
  else if (!withPolicy.has(table)) missingPolicy.push(`${table}  (created in ${file})`);
}

if (missingRls.length) {
  console.error('\n❌ Tables created without `enable row level security`:\n');
  for (const t of missingRls) console.error('   - ' + t);
  console.error('\nAdd `alter table <name> enable row level security;` plus membership-scoped policies.\n');
  process.exit(1);
}

if (missingPolicy.length) {
  // RLS on with no policy = default-deny (safe), but usually a mistake. Warn, don't fail.
  console.warn('\n⚠️  Tables with RLS enabled but no policy (default-deny — intended?):\n');
  for (const t of missingPolicy) console.warn('   - ' + t);
}

console.log(`\n✅ RLS check passed: ${created.size - dropped.size} live table(s), all have RLS enabled.\n`);
