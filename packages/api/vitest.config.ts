import { defineConfig, mergeConfig } from "vitest/config"

import { baseConfig } from "@tooling/vitest-config/base"

export default mergeConfig(
  baseConfig,
  defineConfig({
    // These tests import `@packages/auth/server`, which carries the
    // `server-only` marker. That package resolves to a throwing module unless
    // the `react-server` condition is set — the condition a React Server
    // Component build sets, and the one that makes the marker a build error in
    // the browser rather than a runtime one. Declaring it here says what is
    // true: this suite runs on the server side of that line.
    ssr: {
      resolve: {
        conditions: ["react-server"],
      },
    },

    test: {
      // Vitest hands node_modules straight to Node, which ignores the
      // conditions above. Inlining routes this one package back through Vite's
      // resolver so `react-server` is honoured.
      server: {
        deps: {
          inline: ["server-only"],
        },
      },

      // Importing `@packages/auth/server` builds the production auth instance
      // as a side effect, and that reads these. Nothing here ever connects:
      // postgres-js opens a socket on first query, and every test supplies its
      // own PGlite database instead. A test that reached for the production
      // instance by mistake would fail loudly trying to resolve this host,
      // which is the behaviour worth having.
      env: {
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
        BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-to-pass-32",
        BETTER_AUTH_URL: "http://localhost:3000",
      },
    },
  })
)
