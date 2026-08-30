// The composition root: the one place that names the real database and the
// real auth instance.
//
// It lives here rather than in `apps/web` on purpose. `apps/web/package.json`
// does not list `@packages/db`, and that omission is the mechanism that stops
// a page from running its own queries — building the context over there would
// have required adding the dependency and dissolving the boundary in the same
// commit.
//
// Nothing in this package imports this file. Handlers still receive their
// context; this only supplies one for the process that serves real requests.

import "server-only"

import { auth } from "@packages/auth/server"
import { db } from "@packages/db"

import { env } from "../env"
import type { ApiContext } from "../shared/context"
import { storageFromEnv } from "../storage"

/**
 * Built once rather than per request: it holds no request state, and creating
 * a client per call would open a connection pool per call.
 *
 * This is the one place the report bucket is named. A second domain needing
 * storage adds a line here with its own variable, not a second way of building
 * one.
 */
const reportStorage = storageFromEnv(env, env.SUPABASE_REPORT_BUCKET)

export function liveContext(headers: Headers): ApiContext {
  return { db, auth, headers, reportStorage }
}

// Re-exported rather than given an entry point of its own: the `exports` map
// lists two paths and `surface.test.ts` pins that number, so a development
// convenience is not the thing that widens a package's public surface.
export { seedDevUsers, DEV_PASSWORD, DEV_USERS } from "./seed"
