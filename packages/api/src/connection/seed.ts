// Two accounts to develop against, created the first time the dev server
// starts against an empty database.
//
// **Why it runs from the server rather than as `pnpm seed`.** Creating a user
// means running Better Auth's sign-up, which hashes the password the way
// sign-in will later verify it — a plain SQL INSERT produces a row nobody can
// log in as. And a standalone `node scripts/seed.ts` cannot reach that code:
// bare Node resolves ESM specifiers without adding extensions, so importing
// `@packages/auth/server` fails on its own internal `./config` import, and
// `server-only` is designed to throw outside a framework anyway. Next already
// has both loaded, so it seeds from there and the problem does not arise.
//
// It lives beside `live.ts` for the same reason that file exists: this is the
// second thing in the repo that needs the real database and the real auth
// instance at once, and `apps/web` cannot hold either — it does not depend on
// `@packages/db`, deliberately.

import "server-only"

import { eq } from "drizzle-orm"

import { auth } from "@packages/auth/server"
import { db, schema } from "@packages/db"

/**
 * The same password for both, and a bad one on purpose: it should be obvious
 * at a glance that these accounts are not real. Nothing creates them outside
 * development — see the guard in `apps/web/instrumentation.ts`.
 */
export const DEV_PASSWORD = "dev-password"

/**
 * One of each role, because the two halves of the app are separated by exactly
 * this column: `app/(admin)/` refuses anyone whose profile says `user`, so
 * developing the admin side with only a `user` account means never seeing it,
 * and developing the user side with only an `admin` account means never seeing
 * what a visitor sees.
 */
export const DEV_USERS = [
  { email: "user@example.com", name: "Dev User", role: "user" },
  { email: "admin@example.com", name: "Dev Admin", role: "admin" },
] as const

/**
 * Idempotent, and quiet when there is nothing to do: the dev server restarts
 * on every file change, and a second account with the same address would fail
 * the sign-up rather than be skipped.
 *
 * Failures are logged, never thrown. The most likely one is a database with no
 * tables in it yet — `pnpm supabase:start` before `db:migrate` — and refusing
 * to start the server over a missing convenience would turn a one-line warning
 * into a stack trace nobody asked for.
 */
export async function seedDevUsers(): Promise<void> {
  try {
    for (const { email, name, role } of DEV_USERS) {
      const [existing] = await db
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.email, email))
        .limit(1)

      if (existing) continue

      const { user } = await auth.api.signUpEmail({
        body: { email, name, password: DEV_PASSWORD },
      })

      // Upserted rather than updated: Better Auth's sign-up hook creates the
      // profile row, and this does not depend on having won that race.
      await db
        .insert(schema.profile)
        .values({ userId: user.id, role })
        .onConflictDoUpdate({
          target: schema.profile.userId,
          set: { role },
        })

      console.log(`seed: created ${email} (${role}) — password ${DEV_PASSWORD}`)
    }
  } catch (error) {
    console.warn(
      "seed: skipped —",
      error instanceof Error ? error.message : error
    )
  }
}
