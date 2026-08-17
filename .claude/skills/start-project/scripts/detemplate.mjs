#!/usr/bin/env node
// Mechanical half of the `start-project` skill: rename the project, and cut
// the template-only sections out of the two docs.
//
// This is a script rather than a list of edits because both jobs are exact.
// The rename has to hit every occurrence and no others, and the section
// surgery means deleting from one heading up to the next — the kind of thing
// that silently takes one line too many when done by hand. Everything that
// needs judgement (README, the landing page) is deliberately left out; see
// SKILL.md.
//
// Usage:
//   node detemplate.mjs --name my-project [--keep-example] [--dry-run]

import { readFileSync, writeFileSync, existsSync } from "node:fs"

const args = process.argv.slice(2)
const flag = (name) => args.includes(name)
const value = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}

const NAME = value("--name")
const KEEP_EXAMPLE = flag("--keep-example")
const DRY_RUN = flag("--dry-run")

if (!NAME) {
  console.error("error: --name is required")
  process.exit(1)
}

// npm package names: lowercase, no spaces. The name lands in package.json, so
// an invalid one breaks `pnpm install` rather than anything cosmetic.
if (!/^[a-z0-9][a-z0-9._-]*$/.test(NAME)) {
  console.error(
    `error: "${NAME}" is not a usable package name.\n` +
      "Use lowercase letters, digits, dots, hyphens or underscores, " +
      "starting with a letter or digit — for example: acme-invoices"
  )
  process.exit(1)
}

const changes = []

function edit(path, fn) {
  if (!existsSync(path)) {
    changes.push({ path, note: "skipped — file not found" })
    return
  }
  const before = readFileSync(path, "utf8")
  const after = fn(before)
  if (before === after) {
    changes.push({ path, note: "no change" })
    return
  }
  if (!DRY_RUN) writeFileSync(path, after)
  const delta = after.split("\n").length - before.split("\n").length
  changes.push({ path, note: delta === 0 ? "renamed" : `${delta} lines` })
}

// ---------------------------------------------------------------- rename

for (const path of [
  "package.json",
  "apps/web/app/layout.tsx",
  "apps/web/app/api/spec/route.ts",
  "apps/web/app/api/docs/route.ts",
]) {
  edit(path, (t) => t.replaceAll("base-template", NAME))
}

// S2's tree carries a placeholder rather than the literal name, so that the
// diagram reads correctly in the template too.
edit("docs/architecture.md", (t) => t.replace("\n<project>/\n", `\n${NAME}/\n`))

// --------------------------------------------------- architecture.md cuts

// The header block says which sections are appendices, so cutting them without
// rewriting it leaves the file asserting that S13 exists. Everything above the
// appendices survives the fork, which makes this the one paragraph the script
// has to keep true.
const APPENDIX_BLURB =
  "> S13 onward are the appendices: the part a real project deletes. They are\n" +
  "> numbered on the same scheme, so removing them leaves S1–S12 untouched.\n>\n"

// Appendices run from the divider to the end of the file. Keeping the example
// domain means keeping S14, which is the only remaining instruction for
// removing it later — so the divider and that one section stay.
edit("docs/architecture.md", (t) => {
  if (!t.includes(APPENDIX_BLURB)) {
    throw new Error(
      "the appendix paragraph in the header block has changed shape — " +
        "update APPENDIX_BLURB in this script before running it"
    )
  }

  if (!KEEP_EXAMPLE) {
    const i = t.indexOf("\n---\n---\n\n# Appendices")
    if (i === -1)
      throw new Error("appendix divider not found in architecture.md")
    return t.slice(0, i).replace(APPENDIX_BLURB, "") + "\n"
  }

  let out = t.replace(
    APPENDIX_BLURB,
    "> S14 is an appendix, kept only while the example domain it describes is\n" +
      "> still in the tree. Deleting both leaves S1–S12 untouched.\n>\n"
  )
  for (const id of ["S13", "S15", "S16"]) {
    const start = out.indexOf(`\n## ${id}. `)
    if (start === -1) continue
    const rest = out.slice(start + 1)
    const nextRel = rest.search(/\n## S\d+\. /)
    const end = nextRel === -1 ? out.length : start + 1 + nextRel
    out = out.slice(0, start) + out.slice(end)
  }
  return out.replace(
    "# Appendices — delete these in a real project",
    "# Appendix — delete this once the example domain is gone"
  )
})

// ---------------------------------------------------------- CLAUDE.md cuts

const CLAUDE_START =
  "Most of this file describes rules that hold in any project"
const CLAUDE_END = "\n## Commands"

const KEEP_EXAMPLE_NOTE = `The \`post\` domain is still here as a worked example, wired end to end
(contract → db → api → web) so that \`tsc\` and Vitest keep it honest. Copy it
when building the first real domain, then delete it — \`docs/architecture.md\`
S14 lists every file and every follow-up edit.

`

edit("CLAUDE.md", (t) => {
  const start = t.indexOf(CLAUDE_START)
  const end = t.indexOf(CLAUDE_END)
  if (start === -1 || end === -1) {
    throw new Error("template section markers not found in CLAUDE.md")
  }
  return (
    t.slice(0, start) +
    (KEEP_EXAMPLE ? KEEP_EXAMPLE_NOTE : "") +
    t.slice(end + 1)
  )
})

// ---------------------------------------------------------------- report

console.log(`${DRY_RUN ? "[dry run] " : ""}project name: ${NAME}`)
console.log(`example domain: ${KEEP_EXAMPLE ? "kept" : "appendices removed"}\n`)
for (const c of changes) console.log(`  ${c.path.padEnd(34)} ${c.note}`)
console.log(
  "\nStill to do by hand — see SKILL.md:\n" +
    "  README.md               rewrite for this project\n" +
    "  apps/web/app/page.tsx   replace the placeholder landing page" +
    (KEEP_EXAMPLE
      ? ""
      : "\n  the post example         delete it (architecture.md S14 listed how)")
)
