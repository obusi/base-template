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
import { FEATURES, parseFeatures } from "@packages/shared"
import { storageFromEnv } from "@packages/storage"
import { env as storageEnv } from "@packages/storage/env"

import { REPORT_BUCKET } from "../domains/report/service"
import type { ApiContext } from "../shared/context"

/**
 * Built once rather than per request: it holds no request state, and creating
 * a client per call would open a connection pool per call.
 *
 * This is the one place the report bucket is named. A second domain needing
 * storage adds a line here with its own variable, not a second way of building
 * one.
 */
const reportStorage = storageFromEnv(storageEnv, REPORT_BUCKET)

/**
 * Read from `process.env` directly rather than through a validated `env.ts`,
 * because this package deliberately has none: every value it needs arrives
 * through the context, and this file is the one place allowed to know where
 * they really come from. Nothing here to validate anyway — an empty variable
 * and an absent one both mean "no flags on", and a name that matches no flag
 * is `parseFeatures`'s business.
 *
 * Built once, beside the storage client, for the same reason: it holds no
 * request state. Restarting the process is what picks up a changed value,
 * which is exactly the deploy that changing it required.
 */
const features = parseFeatures(process.env.FEATURES, FEATURES)

export function liveContext(headers: Headers): ApiContext {
  return { db, auth, headers, features, reportStorage }
}
