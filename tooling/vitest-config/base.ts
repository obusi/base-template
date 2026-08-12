import { defineConfig } from "vitest/config"

/**
 * A shared Vitest configuration for the repository.
 *
 * Node environment only: this repo tests pure functions and oRPC handlers
 * talking to a real database, not rendered components. A package that needs
 * a browser-like environment should override `test.environment` locally.
 *
 * `passWithNoTests` keeps `turbo test` green for packages that legitimately
 * have no tests yet, and after the example domain is deleted.
 */
export const baseConfig = defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**"],
    passWithNoTests: true,
  },
})
