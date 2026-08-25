---
name: to-branch
description: Cut a new branch for a piece of work, named to this repo's convention and started from the freshest `main` rather than whatever happens to be checked out. Use this whenever someone is about to start something — "let's add search to posts", "I need to fix the navbar", "new branch", "start a task", "where should I put this work" — and whenever work has begun on `main` by accident and needs somewhere to live. Thai triggers - "แตก branch", "สร้าง branch", "เริ่มงานใหม่", "จะทำฟีเจอร์ใหม่", "ตั้งชื่อ branch". Trigger even when the person does not say the word "branch": starting work without one is the mistake this exists to prevent, and the cost of asking is one line while the cost of missing it is a push that the branch rules reject.
argument-hint: "<what you're about to work on — leave blank if we've just been discussing it>"
---

# Starting a piece of work on its own branch

This repo works trunk-based: `main` is always deployable, and every change
reaches it through a short-lived branch and a pull request. The branch rules on
GitHub enforce that half — direct pushes to `main` are refused.

What the rules cannot enforce is the two things that actually cause pain later,
which is why this is a skill:

- **A branch cut from a stale `main`** carries conflicts that will not surface
  until merge day, long after the context is gone.
- **A branch named badly** turns `git branch` into a list of guesses, and
  forces a fresh naming decision at commit and again at PR time.

## What this needs from the person

The task, in a few words. It can arrive three ways, and they are tried in this
order:

1. **As an argument** — `/to-branch add full-text search to posts`. Use it.
2. **From the conversation** — if the last stretch of talk makes the task
   obvious, propose a name and **wait for confirmation**. Never cut the branch
   silently on a guess; a wrong guess leaves a badly named branch that someone
   has to notice and delete.
3. **Ask** — if there is no argument and nothing to infer from.

When proposing, show the name and offer the exit in the same breath, so a
correction costs one line:

```
Looks like full-text search over posts
→ feat/post-full-text-search

Use this name, or type the one you want.
```

## The naming convention

```
<type>/<two to five words, hyphenated>
```

**This is the one place the convention is written down.** `to-pr` reads it from
here when it has to name a branch, so a change here changes both.

The types are the same nine that begin every commit message in this repo —
`feat`, `fix`, `docs`, `refactor`, `test`, `ci`, `chore`, `perf`, `build`.
Sharing one vocabulary across branch, commit, and PR title means the naming
decision is made once and then simply carried: a branch called
`feat/post-search` already tells you the commits start with `feat:` and the PR
is titled `feat: …`.

- Lowercase letters, digits, and hyphens only — no underscores, no spaces, and
  no hyphen at the start or end. Mixed case is worse than ugly: some
  filesystems treat `Feat/X` and `feat/x` as the same ref and some do not.
- Name **what the work does**, not which files it touches.
  `feat/post-search`, not `feat/update-posts-page-tsx`. Files move; intent does
  not.
- No personal names, no dates. Git already records both.
- With an issue, put the number after the type: `fix/128-checkout-500`.
- **Past roughly 40 characters, say so rather than refuse.** A name that will
  not fit in a few words is usually a sign the work is bigger than one pull
  request, and that is worth mentioning while it is still cheap to split.

## Cutting it

```bash
git fetch origin && git switch -c <name> origin/main
```

One command, because naming `origin/main` explicitly is what makes the result
independent of where the person happens to be standing. It does not matter
whether they are on a stale local `main` or three commits deep in another
branch — the new work starts from what GitHub has right now.

Uncommitted changes come along automatically, which is almost always what is
wanted: work usually starts before anyone remembers to branch. If those changes
collide with what `main` gained in the meantime, git refuses and says so —
report that and stop rather than reaching for `stash` unprompted, because the
person may want to look at the collision themselves.

## Say something when the ground is not flat

**Already on a branch with unmerged commits.** Mention it before cutting:

```
You're on feat/post-search, which has 3 commits that aren't merged yet.
The new branch will start from origin/main, not from that work.
```

Sometimes stacking is deliberate — work B genuinely needs work A first — and in
that case `origin/main` is the wrong base. The person knows which it is; the
skill only has to make sure they notice.

**The branch name already exists**, locally or on the remote. Stop and offer a
different one rather than switching to the old branch, which silently drops
them into someone else's history.

## What this does not do

It does not commit, does not push, and does not create a pull request. It puts
the work somewhere safe to grow. `to-pr` picks up from there.
