import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * Which bucket the report domain stores into — the only part of storage that
 * belongs to a domain rather than to the project. How to reach Supabase at all
 * lives in `@packages/storage/env`, which knows no domain names.
 *
 * Nothing here is a `.env` this package reads on its own. `packages/api` is
 * imported into `apps/web`, which is the process that opens a file — see
 * docs/architecture.md S9.
 */
export const env = createEnv({
  server: {
    // Private, and declared in `supabase/config.toml` so that `supabase start`
    // creates it locally — see docs/setup.md for the hosted half.
    //
    // Named for the report domain, not for storage in general. A bucket is
    // where Supabase keeps the size limit, the MIME allowlist and the public
    // flag, and not one of the three can be set per folder — so a second
    // domain that needs storage gets a second bucket and a variable of its
    // own. Sharing this one would mean widening its limits for reports too,
    // and those limits are the only thing enforcing them: the browser uploads
    // straight to Supabase, which does not read the bytes it is handed.
    SUPABASE_REPORT_BUCKET: z.string().default("report-attachments"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
