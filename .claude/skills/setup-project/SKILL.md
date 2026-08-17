---
name: setup-project
description: Claim this base-template repo as a specific, named project — rename it everywhere the old name is baked in (including the browser tab title and the published OpenAPI document), rewrite the placeholder README and landing page, and strip the passages that are only true while the repo is a template. Use this whenever someone has just cloned or "Use this template"-d the repo, or says anything like "make this my project", "rename this to X", "set this up as <name>", "get rid of the template stuff", "I'm starting a new project from this", or asks how to begin using the template for real work. Thai triggers - "ตั้งชื่อโปรเจกต์", "เปลี่ยนชื่อ repo", "ทำให้เป็นโปรเจกต์ของผม/ของเรา", "เอา template ออก", "เริ่มโปรเจกต์ใหม่จาก template", "setup โปรเจกต์". Trigger even when they only mention renaming, since the leftover template text actively instructs every future session to keep a real product free of business logic. This does NOT remove the post example domain — that is the separate remove-example-domain skill.
argument-hint: <project-name> [one sentence on what it is]
---

# Claiming the template as a project

The repo ships as a template, and several passages say so. Left in place they
are not merely stale — `CLAUDE.md` loads every session and tells the model that
this repo "ships structure only" and that business logic does not belong in it.
A project that keeps that text is arguing with itself. This skill removes it
and puts the project's own identity in its place.

Two things need doing that a find-and-replace cannot: the README and the
landing page describe *the template*, and a project needs them to describe
*itself*. Those are the parts to spend thought on. The rest is mechanical and
a bundled script handles it.

The `post` example domain is not this skill's concern. It is a working vertical
slice that stays useful right up until the first real domain exists, and
`remove-example-domain` handles it when that day comes.

## What this needs from the person

Two things, and both may already have arrived as arguments —
`/setup-project acme-invoices billing for small studios`. Take what is there and
ask only for the rest. Re-asking for something they just typed is the fastest
way to make a tool feel like it is not listening.

1. **The project name** *(required)*. It becomes the npm package name, so it
   needs to be lowercase with no spaces (`acme-invoices`, not `Acme Invoices`).
   If they give a display name, propose the slug and confirm it before using it.

2. **What the project actually is** *(optional, one sentence)*. It fills the
   metadata description, the README's opening, and possibly the landing page.
   Guessing produces the kind of filler text everyone deletes later, so if they
   do not have an answer yet, leave those places honestly bare and say which
   ones you left — that is more useful than invented product copy.

## Before touching anything

**Check `git status` is clean.** Everything below rewrites files in place, and
a clean tree is what makes the whole thing one reviewable `git diff` and one
`git checkout .` away from undone. If the tree is dirty, say so and let the
person commit or stash first.

## Run the mechanical half

```bash
node .claude/skills/setup-project/scripts/rename.mjs --name <slug>
```

Add `--dry-run` first to see what it will touch without writing.

It renames the project in `package.json`, `apps/web/app/layout.tsx`,
`apps/web/app/api/spec/route.ts`, `apps/web/app/api/docs/route.ts`,
`apps/web/features/auth/components/auth-header.tsx`, and the tree diagram in
`docs/architecture.md` S2. Four of those are visible to users — the browser tab,
the `/api/docs` page, the published OpenAPI document, and the "Welcome to …"
heading on the sign-in and sign-up pages. It then
cuts the template-only appendices (S13, S15, S16) out of `docs/architecture.md`
and the template section out of `CLAUDE.md`.

It decides what to do about S14 by looking at whether
`packages/api/src/domains/post/` still exists, rather than asking. If the
example is there, S14 stays as its removal checklist; if someone already ran
`remove-example-domain`, S14 is gone and the last appendix goes with it. Looking
beats asking here because the answer is a fact about the tree, and a question
can be answered wrongly.

## Write the two files that need judgement

**`README.md`** — the first thing anyone opens on GitHub. It currently sells the
template. Rewrite it for the project: what this codebase is *for*, then the path
from clone to running app. Keep the parts that are about the stack rather than
the template — the package table, the dependency graph, the `db:check` warning,
the everyday commands — and drop the "Starting a real project from this"
section, which has just been carried out. Read the existing file rather than
starting from a blank page; most of it survives.

**`apps/web/app/page.tsx`** — a placeholder that describes the template and
links to the example domain. What replaces it depends on the project, so ask
rather than invent: a marketing landing page, a redirect to the app's real entry
point, and a dashboard behind auth are all reasonable, and they are not
interchangeable. If they have no answer yet, keep it minimal and honest — the
project name and a link to wherever work actually starts.

While you are in `layout.tsx`, replace the `description` in `metadata`. The
script renamed the title, but the description still describes the stack rather
than the product, and it is what search results and link previews show.

**Mention, do not fix:** the sign-in and sign-up pages carry three `href="#"`
placeholders — the logo in `features/auth/components/auth-header.tsx`, and the
Terms and Privacy links in `terms-notice.tsx`. Where those point is a product
and legal question, not a rename. Point them out and leave them.

**Also mention: password reset has no mailer.** `createAuth` takes
`sendResetPassword` as an argument and falls back to writing the link to the
server log. That is fine locally and wrong in production, where nobody receives
the email. Say so plainly — it is the one thing on this list that looks fine in
development and fails silently after deploying. Picking a provider is theirs to
do; `docs/architecture.md` S4 has the reasoning.

## Finish

Run `pnpm verify`. It typechecks, lints, tests, and checks formatting, so it
catches a rename that broke an import or a section cut that left a dangling
reference.

Then confirm nothing still points at the template:

```bash
grep -rn "base-template" --exclude-dir=node_modules --exclude-dir=.next \
  --exclude-dir=.git --exclude-dir=.turbo .
grep -rn "S13\|S15\|S16" --include=*.md --include=*.ts --include=*.tsx \
  --exclude-dir=node_modules .
```

Both should be empty. If the example domain is still present, S14 references are
expected and correct — anything pointing at S13, S15, or S16 is now a link to a
deleted section.

**Then delete this skill**: `rm -rf .claude/skills/setup-project`. It cannot run
a second time — the script refuses when the paragraphs it edits are already
gone — so leaving it in a real project is clutter that reads like an unfinished
step. Mention that `remove-example-domain` stays, because it still has work to
do.

Finally, show `git diff --stat` and say plainly what changed, what still carries
the person's own writing, and that `docs/architecture.md` S14 is the checklist
for removing the example domain when the time comes. Do not commit unless asked.

## What this skill deliberately leaves alone

`.claude/rules/`, and everything in `CLAUDE.md` outside the template section,
describe the *stack* rather than the template. They apply unchanged to a real
project, and editing them would be a regression rather than a cleanup.

The version string in `apps/web/app/api/spec/route.ts` is hard-coded separately
from `package.json`. Mention it, since it is published in the OpenAPI document,
but leave the decision — pin it, or read it from `package.json` — to the person.
