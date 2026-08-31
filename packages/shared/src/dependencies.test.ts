// The rule this package exists to keep is "depend on nothing but @orpc/contract
// and zod", and a rule that lives only in a document is a rule that gets broken
// by the first person in a hurry. A single `import { db } from "@packages/db"`
// added here compiles, passes review, and is discovered months later when a
// mobile build tries to bundle Drizzle for React Native.
//
// So the rule is checked instead of written down.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

const ALLOWED = ["@orpc/contract", "zod"]

function runtimeDependencies(relativePath: string): string[] {
  const path = fileURLToPath(new URL(relativePath, import.meta.url))
  const pkg = JSON.parse(readFileSync(path, "utf8")) as {
    dependencies?: Record<string, string>
  }

  return Object.keys(pkg.dependencies ?? {}).sort()
}

describe("dependencies", () => {
  it("are limited to what a React Native bundler can follow", () => {
    expect(runtimeDependencies("../package.json")).toEqual(ALLOWED)
  })

  // Without this, a `runtimeDependencies` that silently returned [] would make
  // the check above pass on any package at all.
  it("are actually read from the file", () => {
    expect(runtimeDependencies("../../db/package.json")).toContain(
      "drizzle-orm"
    )
  })
})
