---
name: start-project
description: Turn this base-template repo into a specific, named project — rename it everywhere the old name is baked in (including the browser tab and the published OpenAPI title), rewrite the placeholder README and landing page, and strip the passages that are only true while the repo is a template. Use this whenever someone has just cloned or "Use this template"-d the repo and says anything like "make this my project", "rename this to X", "set this up as <name>", "get rid of the template stuff", "I'm starting a new project from this", or asks how to begin using the template for real work — even if they only mention renaming, since the leftover template text actively instructs future sessions to keep a real product free of business logic.
---

# Starting a real project from the template

The repo ships as a template, and several passages say so. Left in place they
are not merely stale — `CLAUDE.md` loads every session and tells the model that
this repo "ships structure only" and that business logic does not belong in it.
A project that keeps that text is arguing with itself. This skill removes it
and puts the project's own identity in its place.

Two things need doing that a find-and-replace cannot: the README and the
landing page describe *the template*, and a project needs them to describe
*itself*. Those are the parts to spend thought on. The rest is mechanical and
a bundled script handles it.

## Before touching anything

**Check `git status` is clean.** Everything below rewrites files in place, and
a clean tree is what makes the whole thing one reviewable `git diff` and one
`git checkout .` away from undone. If the tree is dirty, say so and let the
person commit or stash first.

Then find out two things, asking only for what the conversation has not
already answered:

1. **The project name.** It becomes the npm package name, so it needs to be
   lowercase with no spaces (`acme-invoices`, not `Acme Invoices`). If they
   give you a display name, propose the slug and confirm it. Ask what the
   project actually *is*, too — one sentence. You need it for the metadata
   description, the README, and the landing page, and guessing produces the
   kind of filler text everyone deletes later.

2. **Whether to delete the `post` example domain now.** It is a working
   vertical slice through every layer, checked by `tsc` and Vitest on each run.
   Recommend keeping it: when the first real domain gets built, having a
   compiling example to copy is worth more than a tidy tree, and deleting it
   later is a documented checklist. Delete it now only if they ask.

## Run the mechanical half

```bash
node .claude/skills/start-project/scripts/detemplate.mjs --name <slug> [--keep-example]
```

Pass `--keep-example` when the example domain stays. Add `--dry-run` first if
you want to see what it will touch without writing.

It renames the project in `package.json`, `apps/web/app/layout.tsx`,
`apps/web/app/api/spec/route.ts`, `apps/web/app/api/docs/route.ts`, and the
tree diagram in `docs/architecture.md` S2 — three of those are visible to
users, in the browser tab, the `/api/docs` page, and the published OpenAPI
document. It then cuts the template-only appendices out of
`docs/architecture.md` and the template section out of `CLAUDE.md`.

When the example domain is kept, S14 survives on purpose: it is the only
remaining record of which files to delete and which eight to edit afterwards,
and throwing it away would strand whoever finally does it.

## Write the two files that need judgement

**`README.md`** — the first thing anyone opens on GitHub. It currently sells
the template. Rewrite it for the project: what this codebase is *for*, then the
path from clone to running app. Keep the parts that are about the stack rather
than the template — the package table, the dependency graph, the `db:check`
warning, the everyday commands — and drop the "Starting a real project from
this" section, which has just been carried out. Read the existing file rather
than starting from a blank page; most of it survives.

**`apps/web/app/page.tsx`** — a placeholder that describes the template and
links to the example domain. What replaces it depends on the project, so ask
rather than invent: a marketing landing page, a redirect to the app's real
entry point, and a dashboard behind auth are all reasonable, and they are not
interchangeable. If they have no answer yet, keep it minimal and honest — the
project name and a link to wherever work actually starts — rather than
inventing product copy that will read as noise.

While you are in `layout.tsx`, check the `description` in `metadata`. The
script renamed the title but the description still describes the template, and
it is what search results and link previews show.

## Finish

Run `pnpm verify`. It typechecks, lints, tests, and checks formatting, so it
catches a rename that broke an import or a section deletion that left a dangling
reference.

Then check nothing still points at the template:

```bash
grep -rn "base-template" --exclude-dir=node_modules --exclude-dir=.next .
grep -rn "S1[3-6]" --include=*.md --include=*.ts --include=*.tsx \
  --exclude-dir=node_modules .
```

The first should be empty. The second should be empty too unless the example
domain was kept, in which case only S14 references may remain — anything
pointing at S13, S15, or S16 is now a link to a deleted section and needs
rewording.

Finally, show `git diff --stat` and say plainly what changed, what still has
the person's own writing in it, and — if the example domain was kept — that
`docs/architecture.md` S14 is the checklist for removing it when the time
comes. Do not commit unless asked.

## What this skill deliberately leaves alone

`.claude/rules/`, and everything in `CLAUDE.md` outside the template section,
describe the *stack* rather than the template. They apply unchanged to a real
project, and editing them would be a regression rather than a cleanup.

The version string in `apps/web/app/api/spec/route.ts` is hard-coded separately
from `package.json`. Mention it, since it is published in the OpenAPI document,
but leave the decision — pin it, or read it from `package.json` — to the person.
