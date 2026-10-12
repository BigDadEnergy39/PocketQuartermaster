/**
 * Keep-warm ping for the Supabase project behind PocketQuartermaster.
 *
 * WHY THIS EXISTS: Supabase pauses a Free-plan project after 7 days without
 * database activity. Gear gets inventoried around campouts, not daily, so the
 * database routinely sits idle for longer than that — and a paused project
 * means the app fails at exactly the moment someone opens it to pack for a
 * trip. A few real queries a day keep the inactivity timer from ever expiring.
 *
 * WHY A SEPARATE WORKER: the app is an Expo client (APK + a static web build
 * on Vercel) with no server of its own to hang a schedule on. A standalone
 * Worker deploys, fails, and rolls back without touching the app at all.
 *
 * Ported from RoundtableAttendance/keepwarm; only the query differs.
 */

export interface Env {
  /** e.g. https://<ref>.supabase.co */
  SUPABASE_URL: string
  /** The publishable/anon key — the same one the browser already ships. */
  SUPABASE_ANON_KEY: string
  /**
   * healthchecks.io ping URL. Optional: without it the ping still runs, you
   * just never find out when it stops. See README.md for why you want it.
   */
  HEALTHCHECK_URL?: string
}

/**
 * A hung request must not hold the invocation open indefinitely.
 *
 * WHY 30s and not something tighter: a warm project answers this query in well
 * under a second, so a short timeout looks reasonable — but a project that has
 * just resumed from pause is cold, and measured here it took over 10 seconds to
 * answer the first call. That is exactly the moment we least want a false
 * alarm. Waiting costs nothing (wall-clock spent awaiting a subrequest is not
 * billed CPU time); alerting for no reason costs trust in the alert.
 */
const REQUEST_TIMEOUT_MS = 30_000

/**
 * One retry, then give up until the next cron.
 *
 * The inactivity budget is 7 days and we ping 21 times inside it, so a single
 * lost ping is genuinely harmless to the actual goal. The retry is not there to
 * protect the database from pausing — it is there so a transient blip doesn't
 * fire the dead-man's switch and teach us to ignore it.
 */
const RETRY_DELAY_MS = 5_000

/**
 * The all-zeros "nil" UUID. Real unit ids come from gen_random_uuid(), which
 * never produces it, so this can only ever name a unit that does not exist.
 */
const NIL_UNIT_ID = '00000000-0000-0000-0000-000000000000'

export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    // Deliberately awaited rather than fired into waitUntil: a throw here marks
    // the cron invocation as failed in the Cloudflare dashboard, which is the
    // built-in half of the monitoring story.
    await keepWarm(env)
  },
} satisfies ExportedHandler<Env>

async function keepWarm(env: Env): Promise<void> {
  try {
    const answer = await withOneRetry(() => pingDatabase(env))
    console.log(`keep-warm ok — is_unit_member() answered ${answer}`)
    await reportHealth(env, 'success')
  } catch (error) {
    console.error('keep-warm FAILED:', error instanceof Error ? error.message : error)
    await reportHealth(env, 'fail')
    // Rethrow so the invocation is recorded as failed rather than silently
    // swallowed — the dashboard's cron history is the backstop if the
    // dead-man's switch itself is misconfigured.
    throw error
  }
}

/** Runs `fn`, and on any failure waits RETRY_DELAY_MS and runs it once more. */
async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (error) {
    console.warn(
      'keep-warm first attempt failed, retrying once:',
      error instanceof Error ? error.message : error,
    )
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    return await fn()
  }
}

/**
 * Calls is_unit_member() as a logged-out visitor, asking about a unit that
 * cannot exist.
 *
 * WHY THIS RPC: the `anon` role is deliberately locked out of every table
 * here (migration 023), so a plain table read would come back as a
 * permission error. is_unit_member() is the one thing a logged-out caller can
 * run that still makes Postgres do real work — it looks up unit_members —
 * while being a pure `select exists(...)` that cannot write. With no session,
 * auth.uid() is null, so the answer is always `false` and nothing about any
 * real unit is revealed. No new function, grant, or migration was needed.
 *
 * IF THIS STARTS RETURNING 401/403/404: someone has (reasonably) revoked
 * anon's EXECUTE on is_unit_member or changed its signature. The fix is a
 * dedicated no-op RPC granted to anon, added through a migration — not
 * loosening a table grant.
 */
async function pingDatabase(env: Env): Promise<boolean> {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/is_unit_member`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ unit: NIL_UNIT_ID }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '<unreadable>')
    throw new Error(`Supabase returned ${response.status}: ${body.slice(0, 200)}`)
  }

  const answer: unknown = await response.json()

  // Anything but `false` still touched Postgres, and so still kept the project
  // warm — but `true` would mean a logged-out caller is somehow a member of a
  // unit that does not exist, and a non-boolean would mean the RPC has changed
  // shape underneath us. Both deserve a loud failure, not a quiet "ok".
  if (answer !== false) {
    throw new Error(`Unexpected is_unit_member() answer: ${JSON.stringify(answer).slice(0, 200)}`)
  }

  return answer
}

/**
 * Reports to a dead-man's switch (healthchecks.io).
 *
 * WHY a dead-man's switch rather than ordinary error alerting: the failure that
 * actually hurts is the cron never running at all — a deleted trigger, a
 * disabled Worker, a rotated key. That produces no error to alert on, because
 * no code runs. Inverting the question — "tell me when the check-ins STOP" — is
 * the only shape that catches silence.
 *
 * Failures here are logged but never rethrown: the monitor must not be able to
 * break the thing it monitors. A healthchecks.io outage should not turn into a
 * failed keep-warm ping and, three weeks later, a paused database.
 */
async function reportHealth(env: Env, outcome: 'success' | 'fail'): Promise<void> {
  if (!env.HEALTHCHECK_URL) return

  const url = outcome === 'fail' ? `${env.HEALTHCHECK_URL}/fail` : env.HEALTHCHECK_URL
  try {
    await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  } catch (error) {
    console.error('healthcheck ping failed:', error instanceof Error ? error.message : error)
  }
}
