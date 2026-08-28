import type { Auth } from "@packages/auth/server"
import type { Database } from "@packages/db"

import type { Storage } from "../storage"

/**
 * What a caller must supply before any procedure can run.
 *
 * All three are handed in rather than imported, and that is the whole point:
 * `apps/web` passes the live database, the live auth instance, and the real
 * request headers, while a test passes a throwaway PGlite database, an auth
 * instance bound to it, and headers carrying a cookie from a real sign-in.
 * Neither the handlers nor the middleware can tell the difference, so there is
 * no test-only branch anywhere in this package.
 */
export type ApiContext = {
  db: Database

  /**
   * Injected for the same reason `db` is. `requireAuth` asks this instance who
   * the caller is, and a test needs that question answered by the database it
   * just seeded, not by production.
   */
  auth: Auth

  /**
   * The incoming request's headers, which is where the session cookie lives.
   * oRPC's adapters provide these; `createRouterClient` callers construct them.
   */
  headers: Headers

  /**
   * Object storage for report attachments, or `null` where none is configured.
   *
   * `null` is a normal state, not a broken one — the same shape as
   * `sendResetPassword` being absent. A deployment without a bucket runs
   * fine; `report.createUploadUrls` answers ATTACHMENTS_UNAVAILABLE and the
   * form hides its file picker.
   */
  storage: Storage | null
}
