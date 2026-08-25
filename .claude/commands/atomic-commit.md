---
description: >-
  Create clean, atomic git commits with well-formed Conventional Commits
  messages. Use whenever changes need recording in git — "commit this",
  "commit my work", "save these changes", "break this into commits", "clean up
  my commit history" — or when staging and committing on the user's behalf.
  Prefer this over an ad-hoc single `git commit -am "..."` whenever there is
  more than one distinct change to record.
argument-hint: "[issue-number]"
---

Record the current work in git, following the guidance below.

Issue or ticket number for this commit (blank if none): $ARGUMENTS

# Atomic Commits

Two things make a commit history worth having: **atomicity** (each commit is one
self-contained logical change) and **clear messages** (each message says what
changed and why, in a predictable format). This command covers both.

## Why atomic commits matter

A commit is the unit of undo, review, and archaeology. When each commit does
exactly one thing:

- **Reverting is surgical** — `git revert <sha>` removes one change without
  dragging unrelated work with it.
- **`git bisect` actually works** — you can pinpoint the commit that introduced
  a bug because each commit is a coherent state, not a grab-bag.
- **Review is faster** — a reviewer can hold one idea in their head per commit.
- **`git log` becomes a changelog** — the history reads like a story of the
  project instead of "wip", "fix", "more stuff".

The failure mode to avoid is the catch-all commit: a feature, an unrelated bug
fix, a dependency bump, and a reformatting pass all mashed into one `git commit
-am`. Splitting these apart is the core discipline here.

Don't over-correct, though. Atomic means *one logical change*, not *one file* or
*one line*. If a single feature legitimately touches eight files, that's one
commit. Splitting a coherent change into artificially tiny pieces is just as bad
as lumping unrelated ones together.

## Workflow

### 1. Survey what changed

Never commit blind. Build a mental model of the full diff first:

```bash
git status                 # what's modified, staged, untracked
git diff                   # unstaged changes in detail
git diff --staged          # anything already staged
git log --oneline -8       # match the repo's existing message style
```

Reading recent history matters: adopt the project's conventions (scope names,
casing, whether they use Conventional Commits at all, any trailers) rather than
imposing a foreign style.

### 2. Plan the commits

Look at the changes and group them into logical units. Ask of each change: *does
this belong with that one, or is it a separate concern?* Signals that two
changes belong in **different** commits:

- One is a **feature**, the other is an unrelated **bug fix**.
- One changes **behavior**, the other is a **pure refactor** (renaming, moving
  code) that should be behavior-preserving.
- One is **formatting/whitespace only** — isolate it so real changes aren't
  buried in noise.
- One is a **dependency bump or config change** unrelated to the feature.
- One touches **generated/vendored files** (lockfiles, build output) that can be
  committed separately for a cleaner diff.

State the plan briefly before acting, e.g. "I'll make three commits: (1) the
auth feature, (2) the unrelated typo fix in the README, (3) the prettier
reformat." This lets the user redirect before anything is written.

### 3. Stage each unit precisely

The goal is that `git diff --staged` shows **only** the changes for the commit
you're about to make.

- Whole files that belong to one unit: `git add path/to/file` (avoid blanket
  `git add -A` / `git add .` when you're splitting — it defeats the purpose).
- A single file containing changes for **different** commits: stage it in
  pieces with patch mode:

  ```bash
  git add -p path/to/file
  ```

  Patch mode walks you through each hunk: `y` to stage it, `n` to skip, `s` to
  split a hunk into smaller ones, `e` to edit the hunk by hand for line-level
  control. (`git add -p` is interactive; when running non-interactively, stage
  by pathspec instead, or script the hunk selection.)
- New files: `git add path/to/newfile` (untracked files don't appear in
  `git add -p` until added).

Always re-check `git diff --staged` before committing to confirm the boundary is
clean.

### 4. Draft the message (Conventional Commits)

Format:

```
type(scope): short imperative summary

Optional body explaining *why* the change was made — the diff already
shows *what* and *how*. Wrap at ~72 chars.

Optional footer(s): BREAKING CHANGE: ..., Refs #123, Co-authored-by: ...
```

**The blank line between subject and body is required**, not cosmetic. Git uses
it to tell the two apart: omit it and the whole message becomes the subject, so
`git log --oneline`, `--format=%s`, PR titles, and every tool built on them
spill the entire body onto one line.

**Type** — pick the one that describes the change's intent:

| Type       | Use for                                                        |
| ---------- | -------------------------------------------------------------- |
| `feat`     | a new user-facing feature                                      |
| `fix`      | a bug fix                                                      |
| `refactor` | code change that neither adds a feature nor fixes a bug        |
| `perf`     | a change that improves performance                             |
| `docs`     | documentation only                                             |
| `style`    | formatting, whitespace, semicolons — no code-behavior change   |
| `test`     | adding or fixing tests                                         |
| `build`    | build system, bundler, or dependency changes                   |
| `ci`       | CI configuration and scripts                                   |
| `chore`    | maintenance that doesn't fit above (tooling, scaffolding)      |
| `revert`   | reverts a previous commit                                      |

**Scope** (optional) — a noun for the affected area, in parentheses:
`feat(auth):`, `fix(ui):`, `chore(deps):`. Keep scopes consistent with what the
repo already uses.

**Subject line rules** (this is the line people actually read):

- **Imperative mood**: "add", "fix", "remove" — not "added"/"adds"/"adding".
  Trick: it should complete the sentence "If applied, this commit will ___".
- **≤ 50 characters**, lowercase after the type, **no trailing period**.
- Describe the change, not the activity: "fix null deref in parser", not
  "worked on parser bug".

**Body** — add one when the *why* isn't obvious from the subject: the motivation,
the tradeoff considered, the bug's symptom. Skip it for trivial changes; a
padded body is worse than none.

**Breaking changes** — signal them with a `!` after the type/scope **and** a
footer, so tooling can bump the major version:

```
feat(api)!: require auth token on all endpoints

BREAKING CHANGE: unauthenticated requests now return 401 instead of
falling back to the anonymous user.
```

**Issue / ticket references** — add one **only when the user gives you a
number** (as the `/atomic-commit <number>` argument or in their message). Then
reference it the way the repo already does — usually a footer:

- `Closes #123` / `Fixes #123` when the commit resolves the issue.
- `Refs #123` when it's merely related.
- Or appended to the subject as `(#123)` if that's the project's existing style.

If no number is given, do **not** add an issue reference and never invent one —
a fabricated `#123` points readers at the wrong ticket and is worse than none.

**Writing the message portably.** Never embed raw newlines in a single quoted
string — quoting rules differ across bash, zsh, PowerShell, and cmd, and a
message that survives one shell gets mangled by another. Two approaches work
identically on every OS and shell:

- **Repeated `-m` flags** for short messages. Each `-m` becomes its own
  paragraph, with the blank line inserted for you:

  ```bash
  git commit -m "fix(parser): guard against null row on empty CSV" -m "Empty files produced a null first row, crashing the importer on upload."
  ```

- **A message file plus `git commit -F`** for anything long, multi-paragraph, or
  containing characters a shell might interpret (`$`, backticks, quotes). Write
  the file with normal file tools, commit from it, then delete it:

  ```bash
  git commit -F .git/COMMIT_DRAFT.txt
  ```

  This is the most robust option — the shell never parses the message at all, so
  there is nothing to escape and no platform to detect. Prefer it whenever a
  body or footer is involved. (`.git/` is a good spot for the draft: it is never
  tracked and never shows up in `git status`.)

A bash/zsh heredoc also works if you know you are on a POSIX shell, but it is a
convenience, not the default — it is a syntax error in PowerShell, so reach for
`-F` instead when the platform is unknown.

### 5. Propose options and let the user choose

Don't just commit the first message that comes to mind — offer a choice. For
each commit unit, draft a **recommended** message plus 2–3 alternatives that
differ in a meaningful way (a different `type` or `scope`, more or less detail,
with or without a body), and present them with `AskUserQuestion`:

- Put the recommended option **first** and end its label with `(Recommended)`.
- Use each option's **label** for the subject line and its **description** to
  explain the tradeoff — e.g. "narrower scope", "adds a body explaining why",
  "`chore` instead of `feat`".
- Give each option a **preview** containing the full message exactly as it will
  be committed (subject + body + any footer), so the user sees the real thing
  before choosing.
- The user can always pick "Other" to type their own wording.

Commit only the option the user selects. When you planned several commits,
repeat this propose → select → commit cycle once per unit so each commit gets
its own chosen message.

The choice is the default because the subject line is the one thing everyone
reads later, and only the user knows which framing fits. Skip the prompt and use
your recommended message when the user has clearly asked for speed (e.g. "just
commit it, don't ask") — pestering them then would defeat the point.

### 6. Check, commit, verify

Before committing, run the project's own checks — typecheck, lint, tests,
whatever the repo defines (look in `package.json` scripts, `Makefile`, or CI
config). This is what makes "each commit is buildable" true rather than
aspirational, and it matters most when splitting: the final state can pass while
an intermediate commit doesn't, and that broken commit is exactly the one
`git bisect` will land on months later.

```bash
pnpm typecheck && pnpm lint     # substitute the repo's actual checks
git commit -m "type(scope): summary"
git show --stat HEAD            # confirm the right files and message landed
```

If a check fails, fix it or revisit how the work is split — don't commit a state
you know is broken. Note that checks run against the working tree, not the
index, so when you have staged only part of your changes the run covers more
than the commit does; that's usually fine, but for a truly verified split use
`git stash -k` to set the unstaged remainder aside, run the checks, commit, then
`git stash pop`.

Then return to step 3 for the next unit until the working tree reflects the
plan. A final `git log --oneline` should read as a clean, ordered story.

## Cleaning up existing commits

Everything above is about creating commits. Fixing ones that already exist —
"clean up my history", "that message is wrong", "squash these three" — is a
different operation, and it rewrites history rather than adding to it.

**Check who else has the commits first.** `git log origin/<branch>..HEAD` lists
the commits that exist only locally. Rewriting those is free. Rewriting anything
already pushed is covered under Guardrails below.

| Situation                            | Command                                                     |
| ------------------------------------ | ----------------------------------------------------------- |
| Last message has a typo / wrong type | `git commit --amend`                                        |
| Forgot a file in the last commit     | `git add <file>` then `git commit --amend --no-edit`        |
| Fix belongs to an older commit       | `git commit --fixup <sha>` then rebase with `--autosquash`  |
| Squash, reorder, drop, or split      | `git rebase -i <base>`                                      |
| Undo the last commit, keep the work  | `git reset --soft HEAD~1`                                   |
| Undo the very first (root) commit    | `git update-ref -d HEAD` (no parent exists to reset onto)   |

The `--fixup` flow is the one worth knowing. Instead of hand-editing a rebase
todo list, mark the fix and let git place it:

```bash
git add <files>
git commit --fixup a1b2c3d          # attach this to commit a1b2c3d
GIT_SEQUENCE_EDITOR=true git rebase -i --autosquash a1b2c3d~1
```

`git rebase -i` normally opens an editor, which is unavailable in a
non-interactive session. `GIT_SEQUENCE_EDITOR=true` accepts the generated todo
list unchanged, which is exactly what you want with `--autosquash` since the
ordering is already correct. Any rebase needing real edits to the todo list —
reordering, splitting a commit, rewording several at once — should be handed to
the user to run in their own terminal instead of being forced through.

**Before rewriting anything, record where you were:**

```bash
git rev-parse HEAD                  # note this; it is the way back
```

Nothing is truly lost for a while — `git reflog` lists every position HEAD held,
and `git reset --hard <sha>` returns to any of them. But that safety net is
local and expires, so capture the sha rather than relying on it.

## Examples

**Example 1 — one clean change**
Input: Added a JWT-based login endpoint and its handler.
Output: `feat(auth): add JWT login endpoint`

**Example 2 — describe the change, not the effort**
Input: Spent the afternoon chasing a crash; the CSV parser dereferenced a null
row on empty files.
Output: `fix(parser): guard against null row on empty CSV`

**Example 3 — splitting a mixed working tree**
Input: The diff contains a new export feature, a typo fix in the README, and a
whitespace reformat of an unrelated file.
Output: three commits —
`feat(reports): add CSV export`,
`docs: fix typo in setup instructions`,
`style: reformat legacy config file`

**Example 4 — body carries the why**
Input: Reordered validation so expiry is checked before the DB lookup, cutting
latency on expired tokens.
Output:
```
perf(auth): check token expiry before DB lookup

Every request hit the database even for already-expired tokens, adding
~40ms. Validating expiry first short-circuits those.
```

## Guardrails

- **Only commit when asked.** Committing is an action with side effects — don't
  do it as an unprompted follow-on to editing files.
- **Never push unless the user explicitly asks**, and if the branch is the
  default branch (`main`/`master`), consider creating a topic branch first.
- **Never commit secrets** — scan staged changes for `.env` files, API keys,
  tokens, private keys. If you spot one, stop and flag it instead of committing.
- **Keep each commit coherent and buildable** — don't commit a state you know is
  half-broken to a shared branch; each commit should stand on its own.
- **Never rewrite pushed history on your own initiative.** `--amend`, `rebase`,
  and `reset` on commits that already exist on the remote change their shas;
  anyone who pulled them gets a divergent history and a painful merge. Confirm
  with the user first, and when they do want it, use `--force-with-lease` (which
  aborts if the remote moved) rather than `--force`. Shared branches like `main`
  should be corrected with `git revert`, which adds a commit instead of
  rewriting one.
- **Match the repo's conventions.** If `git log` shows the project doesn't use
  Conventional Commits, follow their actual style instead of forcing this one.
- **Follow existing trailer conventions** (e.g. a `Co-authored-by` trailer if
  the environment or repo uses one) rather than inventing your own.
- **Don't bypass hooks** (`--no-verify`) or skip signing unless the user asks —
  if a pre-commit hook fails, fix the underlying issue.
