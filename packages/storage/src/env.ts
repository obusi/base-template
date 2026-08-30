import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * How to reach the Supabase project — and nothing about what is kept there.
 * A bucket name belongs to the domain that owns the bucket, so it is declared
 * beside that domain (`SUPABASE_REPORT_BUCKET` lives in `packages/api`) and
 * arrives here as an argument to `storageFromEnv`.
 *
 * Both are optional, and both absent is the normal state: the app runs, the
 * report form hides its file picker, and `report.createUploadUrls` answers
 * ATTACHMENTS_UNAVAILABLE instead of failing somewhere deeper. Same shape as
 * `RESEND_API_KEY` in `packages/auth`.
 *
 * Nothing here is a `.env` this package reads on its own. It is imported into
 * `apps/web`, which is the process that opens a file — see
 * docs/architecture.md S9.
 */
export const env = createEnv({
  server: {
    // `https://<project>.supabase.co`, or `http://127.0.0.1:54321` locally.
    // The same project as DATABASE_URL, but named separately: the database is
    // reached over Postgres and storage over HTTPS, and one connection string
    // cannot describe both.
    SUPABASE_URL: z.url().optional(),

    // The **service role** key, not the anon key. It is what lets the server
    // sign an upload URL for a private bucket, and it bypasses every policy in
    // the project — so it is read here, on the server, and never sent to the
    // browser. Putting it in `apps/web/env.ts` under `client` would publish it.
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
