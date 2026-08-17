#!/usr/bin/env node
// Mechanical half of the `setup-project` skill: rename the project, and cut
// the template-only sections out of the two docs.
//
// This is a script rather than a list of edits because both jobs are exact.
// The rename has to hit every occurrence and no others, and the section
// surgery means deleting from one heading up to the next — the kind of thing
// that silently takes one line too many when done by hand. Everything that
// needs judgement (README, the landing page) is deliberately left out; see
// SKILL.md.
//
// The example domain is none of this script's business beyond one question it
// answers by looking rather than asking: is it still here? If it is, S14 stays,
// because it is the checklist for removing it later. `remove-example-domain`
// owns that half.
//
// Usage:
//   node rename.mjs --name my-project [--dry-run]

import { readFileSync, writeFileSync, existsSync } from "node:fs"

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const nameIndex = args.indexOf("--name")
const NAME = nameIndex === -1 ? undefined : args[nameIndex + 1]

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

const EXAMPLE_PRESENT = existsSync("packages/api/src/domains/post")

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

/** Cut `## S<id>. …` and everything under it, up to the next section. */
function cutSection(text, id) {
  const start = text.indexOf(`\n## ${id}. `)
  if (start === -1) return text
  const rest = text.slice(start + 1)
  const nextRel = rest.search(/\n## S\d+\. /)
  const end = nextRel === -1 ? text.length : start + 1 + nextRel
  return text.slice(0, start) + text.slice(end)
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
// appendices survives, which makes this the one paragraph the script has to
// keep true.
const BLURB =
  "> S13 onward are the appendices: the part a real project deletes. They are\n" +
  "> numbered on the same scheme, so removing them leaves S1–S12 untouched.\n>\n"

const BLURB_EXAMPLE_ONLY =
  "> S14 is an appendix, kept only while the example domain it describes is\n" +
  "> still in the tree. Deleting both leaves S1–S12 untouched.\n>\n"

edit("docs/architecture.md", (t) => {
  if (!t.includes(BLURB)) {
    throw new Error(
      "the appendix paragraph in the header block has changed shape — " +
        "update BLURB in this script before running it"
    )
  }

  // Nothing left to keep once the example is gone: cut from the divider on.
  if (!EXAMPLE_PRESENT) {
    const i = t.indexOf("\n---\n---\n\n# Appendices")
    if (i === -1) {
      // remove-example-domain already took the appendices with it.
      return ["S13", "S15", "S16"].reduce(cutSection, t.replace(BLURB, ""))
    }
    return t.slice(0, i).replace(BLURB, "") + "\n"
  }

  let out = t.replace(BLURB, BLURB_EXAMPLE_ONLY)
  out = ["S13", "S15", "S16"].reduce(cutSection, out)
  return out.replace(
    "# Appendices — delete these in a real project",
    "# Appendix — delete this once the example domain is gone"
  )
})

// ---------------------------------------------------------- CLAUDE.md cuts

const CLAUDE_START =
  "Most of this file describes rules that hold in any project"
const CLAUDE_END = "\n## Commands"

const EXAMPLE_NOTE = `The \`post\` domain is still here as a worked example, wired end to end
(contract → db → api → web) so that \`tsc\` and Vitest keep it honest. Copy it
when building the first real domain, then delete it — the
\`remove-example-domain\` skill does that, and \`docs/architecture.md\` S14 is
the same checklist by hand.

`

edit("CLAUDE.md", (t) => {
  const start = t.indexOf(CLAUDE_START)
  const end = t.indexOf(CLAUDE_END)
  if (start === -1 || end === -1) {
    throw new Error("template section markers not found in CLAUDE.md")
  }
  return (
    t.slice(0, start) + (EXAMPLE_PRESENT ? EXAMPLE_NOTE : "") + t.slice(end + 1)
  )
})

// ---------------------------------------------------------------- report

console.log(`${DRY_RUN ? "[dry run] " : ""}project name: ${NAME}`)
console.log(
  `example domain: ${
    EXAMPLE_PRESENT
      ? "present — S14 kept as its removal checklist"
      : "already gone"
  }\n`
)
for (const c of changes) console.log(`  ${c.path.padEnd(34)} ${c.note}`)
console.log(
  "\nStill to do by hand — see SKILL.md:\n" +
    "  README.md               rewrite for this project\n" +
    "  apps/web/app/page.tsx   replace the placeholder landing page\n" +
    "  apps/web/app/layout.tsx the metadata description still describes the stack\n" +
    "\nThen delete this skill — it cannot run twice."
)
