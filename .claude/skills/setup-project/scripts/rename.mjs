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

import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs"

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

// ---------------------------------------------------------------- rename

// The auth header is in this list rather than left to a person because the
// name is rendered twice there — the visible heading and the screen-reader
// label on the logo — and the second one is easy to read past.
for (const path of [
  "package.json",
  "apps/web/app/layout.tsx",
  "apps/web/app/api/spec/route.ts",
  "apps/web/app/api/docs/route.ts",
  "apps/web/features/auth/components/auth-header.tsx",
]) {
  edit(path, (t) => t.replaceAll("base-template", NAME))
}

// S2's tree carries a placeholder rather than the literal name, so that the
// diagram reads correctly in the template too.
edit("docs/architecture.md", (t) => t.replace("\n<project>/\n", `\n${NAME}/\n`))

// ----------------------------------------------------- docs/template.md cuts

// `docs/template.md` holds what is only true while this repo is a template.
// This skill owns some of its sections; the other skill owns the rest. Whichever
// runs second finds nothing left and deletes the file, along with the two lines
// that link to it.
//
// Those links are list items on purpose, so removing them is a line regex
// rather than a paragraph match. The previous arrangement had these two scripts
// coordinating through a three-line sentence they each kept a copy of; the
// copies drifted, and the surviving file described a section that had just been
// cut. `docs/template.md` records the rule and asks that new references keep to
// one line.
const TEMPLATE_DOC = "docs/template.md"
const TEMPLATE_POINTER = /^- .*docs\/template\.md.*\n/gm

/** Cut `## S<id>. …` and everything under it, up to the next section. */
function cutTemplateSection(text, id) {
  const start = text.indexOf(`\n## ${id}. `)
  if (start === -1) return text
  const rest = text.slice(start + 1)
  const nextRel = rest.search(/\n## S\d+\. /)
  const end = nextRel === -1 ? text.length : start + 1 + nextRel
  return text.slice(0, start) + text.slice(end)
}

/** Cut this skill's sections; delete the file and its links if that empties it. */
function pruneTemplateDoc(ids) {
  if (!existsSync(TEMPLATE_DOC)) {
    changes.push({ path: TEMPLATE_DOC, note: "skipped — file not found" })
    return
  }
  const after = ids.reduce(
    cutTemplateSection,
    readFileSync(TEMPLATE_DOC, "utf8")
  )
  edit(TEMPLATE_DOC, () => after)

  // No `## S<n>.` heading left means the other skill has already taken its half.
  if (/^## S\d+\. /m.test(after)) return

  if (!DRY_RUN) rmSync(TEMPLATE_DOC, { recursive: true, force: true })
  changes.push({ path: TEMPLATE_DOC, note: "deleted — nothing left in it" })
  for (const path of ["README.md", "CLAUDE.md"]) {
    edit(path, (t) => t.replace(TEMPLATE_POINTER, ""))
  }
}

// S13, S15 and S16 are this skill's. S14 is the checklist for deleting the
// example domain, so it stays while the example does — `remove-example-domain`
// owns that half, and takes the file with it when it goes last.
pruneTemplateDoc(
  EXAMPLE_PRESENT ? ["S13", "S15", "S16"] : ["S13", "S14", "S15", "S16"]
)

// ---------------------------------------------------------- CLAUDE.md cuts

const CLAUDE_START =
  "Most of this file describes rules that hold in any project"
const CLAUDE_END = "\n## Commands"

const EXAMPLE_NOTE = `The \`post\` domain is still here as a worked example, wired end to end
(contract → db → api → web) so that \`tsc\` and Vitest keep it honest. Copy it
when building the first real domain, then delete it — the
\`remove-example-domain\` skill does that, and \`docs/template.md\` S14 is
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
for (const c of changes) console.log(`  ${c.path.padEnd(50)} ${c.note}`)
console.log(
  "\nStill to do by hand — see SKILL.md:\n" +
    "  README.md               rewrite for this project\n" +
    "  apps/web/app/(app)/(user)/page.tsx  replace the placeholder landing page\n" +
    "  apps/web/app/layout.tsx the metadata description still describes the stack\n" +
    "\nThen delete this skill — it cannot run twice."
)
