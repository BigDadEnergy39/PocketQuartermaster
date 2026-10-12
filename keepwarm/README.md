# Keep-warm Worker

A Cloudflare Worker that makes a small database query three times a day so the
Supabase project never pauses.

## Why this exists

Supabase pauses a **Free-plan project after 7 days without database activity**.
Gear gets inventoried around campouts, not daily, so the database routinely sits
idle for longer than that. Without this, the project gets paused during a quiet
stretch and the app fails at exactly the moment someone opens it to pack for a
trip.

Two things are worth knowing, because they trip people up:

- **Visiting the Supabase dashboard does not count.** The inactivity timer tracks
  database activity — queries, API requests, Edge Function calls. Logging in to
  look at your project does nothing for it.
- **Your data is safe while paused.** A paused project keeps everything and stays
  restorable for a year. Pausing is an outage, not data loss.

The alternative to this Worker is the Supabase Pro plan (~$25/month), which never
pauses.

## Why it is a separate Worker

PocketQuartermaster is an Expo client — an APK plus a static web build on Vercel
— with **no server of its own** to hang a schedule on. This Worker lives in the
same repo but is a completely separate deployment: it has its own `package.json`
and `node_modules`, and it deploys, fails, and rolls back without touching the
app.

It was ported from `RoundtableAttendance/keepwarm`; only the query differs.

## What it actually runs

The logged-out `anon` role is locked out of every table in this project
(migration `023`), so the Worker cannot simply read a row. Instead it calls the
`is_unit_member` RPC with an all-zeros unit id. That makes Postgres run a real
lookup against `unit_members`, cannot write anything, and — because there is no
signed-in user — always answers `false`. No migration or new grant was needed.

## Why a dead-man's switch

The failure that actually hurts is **the cron never running at all** — a deleted
trigger, a disabled Worker, a rotated key. That produces no error to alert on,
because no code runs. Ordinary error alerting cannot catch it.

So the Worker reports to [healthchecks.io](https://healthchecks.io) after each
success, and healthchecks emails you when those reports *stop arriving*. The
question is inverted — "tell me when the pings stop" — which is the only shape
that catches silence.

> This is also why **GitHub Actions is the wrong home for this job**, despite
> being the obvious choice. GitHub disables scheduled workflows after 60 days of
> repository inactivity, and only new commits reset that timer. A finished app
> that goes months between commits is exactly the profile that trips it — the
> keep-alive would switch itself off silently. Cloudflare cron triggers have no
> such rule.

---

## One-time setup

### 1. Create the dead-man's switch

At [healthchecks.io](https://healthchecks.io) (the free tier is plenty), create a
check:

| Setting | Value | Why |
| --- | --- | --- |
| **Schedule** | Period `8 hours` | Matches the cron below. |
| **Grace time** | `16 hours` | Alerts only after ~24h of silence — three consecutive misses. |

Copy the **ping URL** it gives you (looks like `https://hc-ping.com/<uuid>`).

> **Why such a long grace period:** the inactivity budget is 7 days and this
> pings 21 times inside it, so one or two lost pings are genuinely harmless. A
> grace period that emails you over a single blip trains you to ignore the
> alarm — and then you miss the one that matters. 24 hours to notice still
> leaves six days to fix it.

### 2. Set the secrets

From this directory:

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put HEALTHCHECK_URL
```

Each prompts for the value and stores it encrypted on Cloudflare.

- `SUPABASE_URL` — `https://<your-project-ref>.supabase.co`
- `SUPABASE_ANON_KEY` — the **publishable/anon** key, the same one the browser
  bundle already ships (`EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`). **Never
  the `service_role` key.** This Worker only calls one RPC that reveals nothing.
- `HEALTHCHECK_URL` — from step 1. Optional; without it the ping still runs, you
  just never find out if it dies.

> The URL and anon key are not really secret — the anon key is public by design.
> They are stored as secrets because this repo is public and the app itself
> keeps them out of version control too (`.env.local`, EAS env, Vercel settings).

### 3. Deploy

```bash
npm install
npm run deploy
```

Confirm in the Cloudflare dashboard under **Workers → pocketquartermaster-keepwarm →
Settings → Triggers** that three cron schedules are listed.

---

## Local development

```bash
cp .dev.vars.example .dev.vars   # then fill it in
npm run dev
```

`.dev.vars` is wrangler's equivalent of `.env.local` — read only by
`wrangler dev`, never uploaded, and gitignored.

`npm run dev` starts a local Workers runtime with `--test-scheduled`, which
exposes an endpoint to fire the cron by hand instead of waiting 8 hours:

```bash
curl "http://127.0.0.1:8787/__scheduled"
```

(8787 is wrangler's default port; it prints the real one at startup if that is
taken.) Watch the terminal for `keep-warm ok — is_unit_member() answered false`.

**Expect the first call after a resume to be slow.** Measured on the Roundtable
project just after a resume, it took 20.6 seconds; once warm the same query answers in
0.1–0.4 seconds. That gap is why `REQUEST_TIMEOUT_MS` is 30 seconds and not
something tighter.

## Checking on it

```bash
npm run tail          # live logs from the deployed Worker
```

Cron invocation history lives in the Cloudflare dashboard under **Workers →
pocketquartermaster-keepwarm → Logs**. Failed invocations show there even if the
healthchecks side is misconfigured.

## Troubleshooting

### "I deployed it and the cron isn't firing"

**Wait longer before you touch anything.** This is the single most expensive
mistake available here, and we made it.

Cloudflare's docs say cron trigger changes propagate in "up to 15 minutes."
Measured on the Roundtable Worker on 2026-09-03, a freshly deployed trigger took **~89 minutes** to fire
its first invocation — deployed 18:09 UTC, first firing 19:38 UTC. After that it
ran on every single slot with no gaps. We declared it broken at the 63-minute
mark and deleted a trigger that was one slot away from working.

Rules that follow from that:

- **Give a new or changed trigger at least two hours** of silence before
  suspecting a fault.
- **Judge by the healthchecks.io ping list**, not `wrangler tail`. Tail is built
  around fetch events; it showed *zero* of the 28 scheduled invocations that the
  ping list later proved had run. Its silence means nothing.
- **Every deploy restarts the propagation clock**, even one that doesn't change
  the schedule. Redeploying to "fix" a slow trigger makes it slower.

To prove the code and secrets work without waiting on the scheduler, temporarily
add a `fetch` handler that calls `keepWarm(env)` and set `workers_dev: true`.
That runs the real deployed code with the real secrets on demand, isolating
"cron hasn't propagated" from "the Worker is broken." Remove both afterwards.

### Other symptoms

| Symptom | Likely cause |
| --- | --- |
| `Supabase returned 401` | Wrong or rotated anon key. Re-run `wrangler secret put SUPABASE_ANON_KEY`. |
| `Supabase returned 404` | `SUPABASE_URL` is wrong (it must be the bare project URL, no `/rest/v1`), or `is_unit_member`'s signature changed. |
| `Supabase returned 403` / `permission denied for function` | `anon` lost EXECUTE on `is_unit_member`. Add a dedicated no-op RPC granted to `anon` via a migration and point the Worker at it. |
| `The operation was aborted due to timeout` | Project was paused/cold. Harmless once — it retries. Repeated means the project is paused and needs resuming. |
| `Unexpected is_unit_member() answer` | The RPC no longer answers `false` to a logged-out caller. Check `supabase/migrations/`. |
| Healthchecks emails but logs look fine | Check the ping URL, and that grace time is ≥16h. |
