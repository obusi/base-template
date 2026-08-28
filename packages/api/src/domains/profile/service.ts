// Business logic for the profile domain. Knows nothing about oRPC — see
// docs/architecture.md S2 and packages-api.md.
//
// Every caller owns exactly one profile, created either by the auth hook at
// signup (packages/auth/src/config.ts) or, if that failed or the user
// predates this domain, lazily here. So unlike post, there is no "not
// found" case for a caller's own profile to report — `getOrCreateProfile`
// always returns one.

import { eq } from "drizzle-orm"

import { schema, type Database } from "@packages/db"

const { profile } = schema

type Profile = typeof profile.$inferSelect

export async function getOrCreateProfile(
  db: Database,
  userId: string
): Promise<Profile> {
  const [existing] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  if (existing) return existing

  const [created] = await db
    .insert(profile)
    .values({ userId })
    .onConflictDoNothing()
    .returning()

  if (created) return created

  // Lost a race against a concurrent insert — the auth hook, or another
  // request running this same fallback. The row exists now; re-read it.
  const [row] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  if (!row) {
    throw new Error("profile missing after upsert")
  }

  return row
}

export async function updateProfile(
  db: Database,
  userId: string,
  changes: { bio?: string | null; phone?: string | null }
): Promise<Profile> {
  const existing = await getOrCreateProfile(db, userId)

  // Every field of UpdateProfileInput is optional, so "change nothing" is a
  // request the contract accepts. Drizzle throws "No values to set" on
  // `.set({})`, which would surface as INTERNAL_SERVER_ERROR, so answer it
  // with the row as it stands.
  if (Object.keys(changes).length === 0) {
    return existing
  }

  const [row] = await db
    .update(profile)
    .set(changes)
    .where(eq(profile.userId, userId))
    .returning()

  if (!row) {
    throw new Error("profile missing after update")
  }

  return row
}

/**
 * The caller's role, or `undefined` when no profile row exists yet.
 *
 * Deliberately not built on `getOrCreateProfile`: `requireAdmin` runs on every
 * admin request, and a read should not write. A caller with no row is not an
 * admin, which is the same answer the column's default would have given.
 */
export async function getRole(
  db: Database,
  userId: string
): Promise<string | undefined> {
  const [row] = await db
    .select({ role: profile.role })
    .from(profile)
    .where(eq(profile.userId, userId))
    .limit(1)

  return row?.role
}
