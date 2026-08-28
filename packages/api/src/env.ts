import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * Attachments are a switch, not a setting — the same shape as `RESEND_API_KEY`
 * in `packages/auth`. All three absent is the normal state: the app runs, the
 * report form hides its file picker, and `report.createUploadUrls` answers
 * ATTACHMENTS_UNAVAILABLE instead of failing somewhere deeper.
 *
 * Nothing here is a `.env` this package reads on its own. `packages/api` is
 * imported into `apps/web`, which is the process that opens a file — see
 * docs/architecture.md S9.
 */
export const env = createEnv({
  server: {
    // `https://<project>.supabase.co`. The same project as DATABASE_URL, but
    // named separately: the database is reached over Postgres and storage over
    // HTTPS, and one connection string cannot describe both.
    SUPABASE_URL: z.url().optional(),

    // The **service role** key, not the anon key. It is what lets the server
    // sign an upload URL for a private bucket, and it bypasses every policy in
    // the project — so it is read here, on the server, and never sent to the
    // browser. Putting it in `apps/web/env.ts` under `client` would publish it.
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    // Private, and created by hand once per project — see docs/setup.md.
    SUPABASE_STORAGE_BUCKET: z.string().default("report-attachments"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
