---
name: to-pr
description: Take the work that is finished and turn it into a pull request ready for review — commit what is loose, run the repo's gate, push, and open the PR with a description written from the actual diff. It stops there on purpose: it does not merge and does not wait for CI, because the final review is the person's. Use it whenever work is done and needs to go out — "ship this", "open a PR", "push this up", "I'm done with this", "send it for review" — including when the work is sitting uncommitted or was started on `main` by mistake. Thai triggers - "เปิด PR", "ส่งงาน", "push ขึ้นไป", "ทำ PR ให้ที", "งานเสร็จแล้ว". Trigger on the intent to deliver, not on the word "PR"; the steps this skips are the ones that get skipped by hand too.
argument-hint: "<anything the PR description should mention — leave blank to write it from the diff>"
---

# Turning finished work into a pull request

Everything reaches `main` through a pull request, and the branch rules enforce
it. This skill covers the stretch between "the work is done" and "there is a PR
to look at" — the part that is six commands, every one of them forgettable.

**It stops at the open pull request.** It does not merge, and it does not stand
there watching CI. The person reviews and merges; that is the whole reason the
branch rules require a PR in the first place, and a skill that merged for them
would quietly remove the gate they installed. It also means that on the day
merging starts a deployment, nothing here needs revisiting.

## Step 0 — Is this work even on a branch?

Check first, because everything downstream depends on it and the failure is
otherwise a confusing rejected push.

**On a branch already:** carry on to step 1.

**On `main` with changes not yet committed:** harmless. Name a branch using the
convention in [`to-branch`](../to-branch/SKILL.md), confirm it, and
`git switch -c <name>` — the changes come along and `main` is never touched.

**On `main` with commits already made:** stop, and show the plan before running
any of it.

```
2 commits are sitting on your local main, which can't be pushed any more.

  1. git switch -c feat/post-search    ← the 2 commits come along
  2. git switch main
  3. git reset --hard origin/main      ← local main goes back to matching GitHub

Step 3 throws away everything on local main. The commits are safe by then —
step 1 already put them on the new branch.

Go ahead?
```

`reset --hard` is the only command in this workflow that destroys work that
exists nowhere else. Three seconds of reading beats a recovery that may not be
possible, and seeing the order is what makes it obvious the commits are rescued
before anything is discarded.

## Step 1 — Anything uncommitted

Say what is there and ask before committing. If the answer is no, stop here —
they want to handle it themselves, and continuing would be taking the decision
away from them.

If yes, **follow [`atomic-commit`](../../commands/atomic-commit.md)** rather
than writing a commit here. Commit conventions live in that one file so that
changing them changes every path that commits, and one `git commit -am` that
rolls three unrelated changes together destroys exactly the history this repo
keeps deliberately.

## Step 2 — The repo's own gate

Read `package.json` before assuming what to run — `pnpm verify` is this repo's
gate, but this skill should survive being copied somewhere that calls it
something else. Run the gate, and if it fails, **stop without pushing** and show
the real output. Pushing a red branch only moves the same failure somewhere
slower and more public.

## Step 3 — Push

```bash
git push -u origin HEAD
```

## Step 4 — Open the pull request

Read `git diff main...HEAD` and write the description **from that diff**. Not
from memory of the conversation: conversations contain things that were
discussed and then not done, and a description that claims work which is not in
the diff is worse than no description, because it is believed.

Title it as a Conventional Commit matching the branch's type — a branch called
`feat/post-search` gets `feat: add full-text search to posts`. Open it ready for
review, not as a draft; with one reviewer, a draft is a click that buys nothing.

Structure the body this way:

```markdown
## What changed
Two to four lines. The whole change, not a list of commits.

## Why
The reasoning — especially any alternative that was considered and dropped,
and why. This is the part that is gone in six months if it is not written down.

## What to look at
The files or decisions that need human judgement.
```

That last section carries the most weight. A pull request touching twenty files
usually contains two that need thinking about; naming them is the difference
between a review and a scroll. If an argument was passed to the skill, it
belongs here or in **Why**.

The commit list already appears in the PR's own tab, so do not repeat it in the
body — `gh pr create --fill` produces exactly that duplication, which is why the
description is written rather than filled.

## Step 5 — Hand it back

Report the URL, note that CI is running, and stop. Do not poll, and do not offer
to merge.

If the branch has commits that were deliberately kept separate, mention that a
squash merge would collapse them — worth knowing at the moment they pick a merge
button, and not worth a lecture at any other time.

## What this does not do

Merge, delete branches, watch CI, or touch `main` beyond the rescue in step 0.
