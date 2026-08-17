import { defineConfig, mergeConfig } from "vitest/config"

import { baseConfig } from "@tooling/vitest-config/base"

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      // `src/config.ts` builds the production auth instance as a side effect of
      // being imported, and that reads these. Nothing here ever connects: the
      // tests hand `createAuth` their own PGlite database, and postgres-js only
      // opens a socket on the first query. An unreachable host is deliberate —
      // a test that reached the real instance by mistake should fail loudly
      // rather than quietly connect to something.
      //
      // No `react-server` condition, unlike packages/api: these tests import
      // `./config` directly, and that file is deliberately free of the
      // `server-only` marker so the schema generator can load it.
      env: {
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
        BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-to-pass-32",
        BETTER_AUTH_URL: "http://localhost:3000",
      },
    },
  })
)
