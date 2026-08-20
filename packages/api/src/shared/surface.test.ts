// `packages-api.md` states this package's public surface as prose: `index.ts`
// never re-exports `db`, and the `exports` map lists only the two paths
// apps/web actually imports. Nothing at runtime enforces either one — `db` is
// already a dependency this package has, so re-exporting it compiles, lints,
// and formats cleanly. Doing so would hand `apps/web` a database handle
// through `@packages/api`, which it already depends on, even though
// `apps/web/package.json` omitting `@packages/db` is the mechanism that stops
// a page from querying the database directly and skipping `requireAuth`.
//
// Same failure mode `dependencies.test.ts` guards against in
// `packages/contract`: a rule that lives only in a document is a rule the
// first person in a hurry breaks. So the rule is checked instead.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import * as builder from "./builder"
import * as index from "../index"

function readExportsMap(relativePath: string): string[] {
  const path = fileURLToPath(new URL(relativePath, import.meta.url))
  const pkg = JSON.parse(readFileSync(path, "utf8")) as {
    exports?: Record<string, string>
  }

  return Object.keys(pkg.exports ?? {})
}

describe("package.json exports", () => {
  it("lists only the two paths apps/web actually imports", () => {
    expect(readExportsMap("../../package.json")).toEqual([
      ".",
      "./connection/live",
    ])
  })

  // Without this, a readExportsMap that silently returned [] would make the
  // check above pass for any package at all.
  it("is actually read from the file", () => {
    expect(readExportsMap("../../../db/package.json")).toContain("./testing")
  })
})

describe('the "." entry point', () => {
  it("exports the router and nothing else", () => {
    // Most of all: not `db`. See the file header for why that specific export
    // would matter more than any other.
    expect(Object.keys(index)).toEqual(["router"])
  })

  // Without this, an Object.keys call that silently returned [] would make
  // the check above pass no matter what the module actually exported.
  it("is actually read from the module", () => {
    expect(Object.keys(builder)).toEqual(["os"])
  })
})
