import { defineConfig } from "drizzle-kit"

// Relative, not the `@packages/db/env` alias — drizzle-kit's loader misreads
// package-alias imports to files under `src/schema/` as a string prefix, and
// while `env.ts` itself isn't in that folder, this file stays consistent with
// the sibling-import rule schema files follow. See docs/setup-plan.md C15.
import { env } from "./src/connection/env"

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
})
