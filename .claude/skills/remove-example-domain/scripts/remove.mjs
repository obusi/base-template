#!/usr/bin/env node
// Mechanical half of the `remove-example-domain` skill: delete the `post`
// example and every reference the compiler cannot find on its own.
//
// `tsc` catches four of the eight follow-up edits. The other four are comments
// and a pinned table list, which compile perfectly well while pointing at code
// that no longer exists — those are the reason this is a script rather than
// "delete the folders and fix what goes red".
//
// Migrations are deliberately not touched: `drizzle/` already contains a
// CREATE TABLE for the example, and undoing that correctly depends on whether
// the project has deployed. SKILL.md covers the choice.
//
// Usage:
//   node remove.mjs [--dry-run]

import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs"

const DRY_RUN = process.argv.includes("--dry-run")
const changes = []

function edit(path, fn) {
  if (!existsSync(path)) {
    changes.push({ path, note: "skipped — not found" })
    return
  }
  const before = readFileSync(path, "utf8")
  const after = fn(before)
  if (before === after) {
    changes.push({ path, note: "no change" })
    return
  }
  if (!DRY_RUN) writeFileSync(path, after)
  changes.push({ path, note: "edited" })
}

function remove(path) {
  if (!existsSync(path)) {
    changes.push({ path, note: "skipped — not found" })
    return
  }
  if (!DRY_RUN) rmSync(path, { recursive: true, force: true })
  changes.push({ path, note: "deleted" })
}

// ------------------------------------------------------------ the domain

// `apps/web/features/auth` and its two routes are deliberately absent: they
// are real sign-in and sign-up pages wired to Better Auth, and every project
// needs them. Only their redirect target belongs to the example — handled
// below.
for (const path of [
  "packages/contract/src/domains/post",
  "packages/db/src/schema/post.ts",
  "packages/api/src/domains/post",
  "apps/web/app/(app)/(user)/posts",
  "apps/web/features/post",
]) {
  remove(path)
}

// -------------------------------------------- the four `tsc` would catch

edit("packages/contract/src/index.ts", (t) =>
  t
    .replace(
      /\/\/ Re-exported so forms[\s\S]*?from "\.\/domains\/post\/schema"\n\n/,
      "// Re-export a domain's input schemas here when a browser form needs to\n" +
        "// build on the same object the server validates with — see\n" +
        "// docs/architecture.md S6.\n\n"
    )
    .replace(/import \{ postContract \}.*\n\n/, "")
    .replace(
      /export const contract = \{\n  post: postContract,\n\}/,
      "export const contract = {\n  // Add each domain's contract here.\n}"
    )
)

edit("packages/api/src/index.ts", (t) =>
  t
    .replace(/import \{ postRouter \}.*\n/, "")
    .replace(
      /export const router = os\.router\(\{\n  post: postRouter,\n\}\)/,
      "export const router = os.router({\n  // Add each domain's router here.\n})"
    )
)

edit("packages/db/src/schema/index.ts", (t) =>
  t.replace('export * from "./post"\n', "")
)

// Pinned on purpose: "every table has RLS" is also true of a database with no
// tables, so the list is what proves the guard is checking something.
edit("packages/db/src/schema/rls-guard.test.ts", (t) =>
  t.replace(/^\s*"post",\n/m, "")
)

// ------------------------------ the four `tsc` would not: prose and lists

edit("apps/web/lib/orpc-query.ts", (t) =>
  t.replaceAll("orpc.post.", "orpc.<domain>.")
)

edit("apps/web/lib/orpc.server.ts", (t) =>
  t.replace("client.post.list()", "client.<domain>.list()")
)

edit("packages/api/src/testing/index.ts", (t) =>
  t.replace(
    /\/\/ Test helpers shared by every domain's router tests — not specific to\n\/\/ `post`\. Only/,
    "// Test helpers shared by every domain's router tests. Only"
  )
)

// The auth pages survive, but they land on `/posts` when nobody asked for
// anywhere else. Nothing catches this: the pages compile, sign-in succeeds,
// and the 404 arrives a second later. `/` is a safe landing spot rather than
// the right one — SKILL.md says to ask where it should actually go.
//
// Throws rather than shrugging if the constant has moved: a silent no-op here
// leaves a redirect pointing at a deleted route, which is precisely the
// failure this edit exists to prevent.
edit("apps/web/features/auth/redirect.ts", (t) => {
  const before = 'export const DEFAULT_DESTINATION = "/posts"'
  if (!t.includes(before)) {
    throw new Error(
      "DEFAULT_DESTINATION is no longer declared as expected in " +
        "apps/web/features/auth/redirect.ts — update this script, and check " +
        "by hand where the auth pages now send people"
    )
  }
  return t.replace(before, 'export const DEFAULT_DESTINATION = "/"')
})

// ------------------------------------------------------- architecture.md

const BLURB_EXAMPLE_ONLY =
  "> S14 is an appendix, kept only while the example domain it describes is\n" +
  "> still in the tree. Deleting both leaves S1–S12 untouched.\n>\n"

edit("docs/architecture.md", (t) => {
  // Cut S14 itself.
  const start = t.indexOf("\n## S14. ")
  let out = t
  if (start !== -1) {
    const rest = t.slice(start + 1)
    const nextRel = rest.search(/\n## S\d+\. /)
    const end = nextRel === -1 ? t.length : start + 1 + nextRel
    out = t.slice(0, start) + t.slice(end)
  }

  // If setup-project already ran, S14 was the last appendix and the header
  // block promised it. Both go. If it has not run, S13/S15/S16 are still
  // there and "S13 onward are the appendices" stays true — leave it alone.
  if (out.includes(BLURB_EXAMPLE_ONLY)) {
    out = out.replace(BLURB_EXAMPLE_ONLY, "")
    const divider = out.indexOf("\n---\n---\n\n# Appendi")
    if (divider !== -1) out = out.slice(0, divider) + "\n"
  }
  return out
})

// setup-project leaves this note behind while the example is still present.
edit("CLAUDE.md", (t) =>
  t.replace(
    /The `post` domain is still here as a worked example[\s\S]*?\n\n/,
    ""
  )
)

// ---------------------------------------------------------------- report

console.log(`${DRY_RUN ? "[dry run] " : ""}removing the post example\n`)
for (const c of changes) console.log(`  ${c.path.padEnd(40)} ${c.note}`)
console.log(
  "\nNot done here — see SKILL.md:\n" +
    '  packages/db/drizzle/     still contains CREATE TABLE "post"\n' +
    "  apps/web/app/(app)/(user)/page.tsx  may still link to /posts\n" +
    "  features/auth/redirect.ts DEFAULT_DESTINATION is now / — confirm that is right\n" +
    "\nRun `pnpm verify`. Green means the removal is complete: tsc covers four\n" +
    "of the edits above and rls-guard.test.ts covers the pinned table list.\n" +
    "\nThen delete this skill — there is nothing left for it to remove."
)
