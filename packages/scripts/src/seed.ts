// `pnpm seed` — two accounts to develop against, for a database that has none.
//
// Run it after `pnpm supabase:reset`, or any other time the database is empty.
// It is safe to run twice: an account that already exists is skipped, because
// signing the same address up again would fail rather than be ignored.
//
// **Why this is not `seed.sql`.** Creating a user means running Better Auth's
// sign-up, which hashes the password the way sign-in will later verify it. A
// plain SQL INSERT produces a row nobody can log in as, which is also why
// `[db.seed]` is switched off in `supabase/config.toml`.
//
// **Why the two flags in `package.json`.** Bare `node` resolves ESM specifiers
// without adding extensions, so importing `@packages/auth/server` fails on
// that package's own `./config` import — `tsx` resolves the way the bundlers
// do. And `@packages/auth/server` carries `import "server-only"`, a module
// designed to throw outside a framework; `--conditions=react-server` is what
// makes it resolve to the empty version instead.

import { eq } from "drizzle-orm"

import { auth } from "@packages/auth/server"
import { closeDb, db, schema } from "@packages/db"

/**
 * The same password for both, and a bad one on purpose: it should be obvious
 * at a glance that these accounts are not real. Nothing creates them except
 * this script, run by hand.
 */
const DEV_PASSWORD = "12345678"

/**
 * One of each role, because the two halves of the app are separated by exactly
 * this column: `app/(admin)/` refuses anyone whose profile says `user`, so
 * developing the admin side with only a `user` account means never seeing it,
 * and developing the user side with only an `admin` account means never seeing
 * what a visitor sees.
 */
const DEV_USERS = [
  { email: "user@example.com", name: "Dev User", role: "user" },
  { email: "admin@example.com", name: "Dev Admin", role: "admin" },
] as const

/**
 * Nothing is caught. This is a command someone typed, so a database with no
 * tables in it should end in a non-zero exit and a stack trace naming the
 * missing relation — not a warning that scrolls past while the accounts it
 * promised silently do not exist.
 */
async function seed(): Promise<void> {
  for (const { email, name, role } of DEV_USERS) {
    const [existing] = await db
      .select({ id: schema.user.id })
      .from(schema.user)
      .where(eq(schema.user.email, email))
      .limit(1)

    if (existing) {
      console.log(`seed: ${email} already exists`)
      continue
    }

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
}

// Closed in a `finally` so a failure still releases the pool. Without this the
// process finishes its work and then sits on an idle connection forever.
try {
  await seed()
} finally {
  await closeDb()
}
