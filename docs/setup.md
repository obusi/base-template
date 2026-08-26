# Setup

Everything here is done once per project, and none of it can be carried in the
repository — each step depends on something that does not exist until someone
creates it: a database, a GitHub repository, a local `.env`.

Steps 1–5 are needed by every deployment. Step 6 is needed once per repository
and applies only to GitHub.

This document says *what to do*. When a step turns on something surprising, it
links to [`architecture.md`](architecture.md), which says *why* — the reasoning
lives there and only there.

## Requirements

**Node 24+**, **pnpm 10**, a Postgres database (Supabase is what this is built
against), and the [`gh` CLI](https://cli.github.com) for step 6.

## 1. Install

```bash
pnpm install
```

## 2. Create the database

On Supabase, two options must be set **at project creation**. Not on Supabase?
See "On another Postgres host" below; the rest of this document is unchanged.

- **Enable Data API — off.** It publishes a REST endpoint that reaches the
  database with the anon key. Nothing here uses it — no `@supabase/*` package is
  installed anywhere. RLS deny-all is the wall; not opening the door at all is
  better.
- **Enable automatic RLS — on.** An event trigger enables RLS on every new
  table, as a backstop for tables created by hand in the SQL editor.

## 3. Write the environment files

```bash
cp apps/web/.env.example apps/web/.env
cp packages/db/.env.example packages/db/.env
```

Two files because they belong to two processes. The `DATABASE_URL` in both
must match.

Each variable is commented where it is declared. What follows is where the
values come from.

| Variable | File | Required | Where it comes from |
|---|---|---|---|
| `DATABASE_URL` | both | yes | the Supabase dashboard |
| `BETTER_AUTH_SECRET` | web | yes | generated locally |
| `BETTER_AUTH_URL` | web | yes | the address the browser uses |
| `RESEND_API_KEY` | web | no | resend.com |
| `RESEND_FROM` | web | no | a domain Resend has verified |
| `GOOGLE_CLIENT_ID` | web | no | Google Cloud console |
| `GOOGLE_CLIENT_SECRET` | web | no | Google Cloud console |
| `BETTER_AUTH_ALLOWED_HOSTS` | web | no | nothing, until there are preview deployments |

Three of the optional ones are feature switches rather than settings: with
`RESEND_API_KEY` absent, password-reset links go to the server log; with the
Google pair absent, the "Continue with Google" button still renders and fails on
click. The app runs without any of them.

`BETTER_AUTH_ALLOWED_HOSTS` is the odd one out — not a feature but a deployment
detail. It names the extra hostnames an origin check should accept, which only
matters where the hostname is not fixed, as on a preview deployment that gets a
new one every build. Leave it empty locally and in production.

### `DATABASE_URL`

In the Supabase dashboard, **Connect** at the top of the project (older
projects: Project Settings → Database → Connection string). Two are offered:

- **Transaction pooler** — for serverless deployments, where connections are
  short and numerous.
- **Direct connection** — for a long-running server, and the safer default for
  `packages/db/.env`, which only `db:migrate`, `db:check`, and `db:studio` use.

`packages/db/src/connection/client.ts` sets `prepare: false` — the transaction
pooler rejects prepared statements — so the app works on either.
Replace the `[YOUR-PASSWORD]` placeholder in the string with the database
password chosen when the project was created — it is not shown again, and is
reset from the same screen if it was never recorded.

### `BETTER_AUTH_SECRET`

Generate a fresh one per environment, and never carry the development value
into production — it signs every session token.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

`openssl rand -base64 32` produces the same thing where openssl is installed;
the line above needs only Node, which this repo already requires. Anything
shorter than 32 characters is refused at startup by `packages/auth/src/env.ts`.

### `BETTER_AUTH_URL`

The origin the browser actually uses: `http://localhost:3000` in development,
the deployed origin in production. Better Auth builds callback and email links
from it, so a mismatch breaks sign-in in ways that read as unrelated bugs.

### `RESEND_API_KEY` and `RESEND_FROM` — optional

Leave both empty while developing. Password-reset links are written to the
server log instead of emailed, which is fine locally and silently wrong once
deployed, where nobody receives them.

1. Create an account at [resend.com](https://resend.com).
2. **API Keys → Create API Key**, with sending permission. The value is shown
   once.
3. Paste it as `RESEND_API_KEY`.

`RESEND_FROM` defaults to Resend's sandbox address, which delivers only to the
address that owns the Resend account — enough to see the email arrive, not
enough for real users. For those: **Domains → Add Domain**, publish the DNS
records Resend lists, then set `RESEND_FROM` to an address on that domain.
Resend rejects a `from` on a domain it has not verified.

### `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — optional

Both or neither: `packages/auth/src/config.ts` registers the provider only when
both are set. The button renders either way. Unconfigured, it answers
`PROVIDER_NOT_FOUND` on click, which is deliberate — `social-buttons.tsx` says
why it fails loudly rather than hiding itself.

1. [console.cloud.google.com](https://console.cloud.google.com) → create or
   select a project.
2. **APIs & Services → OAuth consent screen**, and complete it first. The
   credentials screen will not issue a client until it exists.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID →
   Web application**.
4. Under **Authorised redirect URIs**, add this exactly:

   ```
   http://localhost:3000/api/auth/callback/google
   ```

   The pattern is `${BETTER_AUTH_URL}/api/auth/callback/google`, so each
   environment needs its own entry on the same client, or its own client.
5. Copy the client ID and client secret into the two variables.

While the consent screen is in **Testing**, only the accounts listed on it as
test users can sign in — the first failure after wiring this up is usually
that, not the credentials.

## 4. Apply the schema, then check it

```bash
pnpm --filter @packages/db db:migrate
pnpm --filter @packages/db db:check
```

`db:check` proves the deployment's roles are what RLS deny-all assumes: that the
role in `DATABASE_URL` both owns the tables and bypasses RLS. Both ways of
getting this wrong are silent, which is why the check exists. It is only
meaningful once at least one row exists.

It then reports what `anon` and `authenticated` can see, a line per role and
table. Three answers are safe, and they are not equally strong:

| the line reads | what it means |
|---|---|
| `cannot reach` | the role cannot resolve the name at all — the strongest |
| `0 of N rows` | the role reads the table and RLS filters every row out |
| `0 rows (table is empty — inconclusive)` | nothing to prove either way yet |

**`cannot reach` is the expected result here**, because step 2 turned the Data
API off. `anon` and `authenticated` exist only to serve PostgREST; with it off
they are never granted USAGE on the schema, and Postgres reports a table in a
schema a role cannot use as nonexistent rather than as forbidden. A leaked key
cannot read those tables, and cannot discover that they exist.

Anything else is a real finding. The script lists what it found and exits
non-zero.

## 5. Run it

```bash
pnpm dev
```

The app is at `http://localhost:3000`. Sign up at `/signup`, then `/posts` is a
worked example. Interactive API docs are at `/api/docs`.

## 6. Protect the default branch

Branch rules live in GitHub's settings rather than in the repository, so a fork
starts with none of them. `.github/rulesets/` keeps them as files instead, split
in two because the halves have different lifetimes.

Both need a plan that includes rulesets — Team or Enterprise for an
organization, Pro for a personal account, or any public repository.

Apply them **before pushing anything else**: once they are active, `main` stops
accepting direct pushes, and the ruleset files themselves would have to arrive
through a pull request.

`org-default-branch.json` targets every repository in an organization and is
applied once, ever. It requires a pull request into the default branch and
blocks force-pushes and deletion. Nothing in it assumes a particular stack, so
repositories created later inherit it on the day they are created.

```bash
gh auth refresh -s admin:org
gh api --method POST orgs/YOUR_ORG/rulesets --input .github/rulesets/org-default-branch.json
```

`repo-required-checks.json` is per repository, because it names the `verify`
check from `.github/workflows/ci.yml`. An organization-wide rule naming a check
that some repository never runs would leave every pull request there waiting
forever, which is why this half is not in the file above.

```bash
gh api --method POST repos/OWNER/REPO/rulesets --input .github/rulesets/repo-required-checks.json
```

Spell out the owner and repository. `gh` can fill in `{owner}/{repo}` from the
checkout, but the braces need quoting in PowerShell, where they open a script
block, and must be left unquoted in `cmd.exe`, where the quotes become part of
the path and the call 404s. Naming them avoids the difference.

Reviews are set to zero approvals so a lone developer is not locked out of their
own pull requests — nobody can approve their own. Raise
`required_approving_review_count` in the organization ruleset once more than one
person is committing.

To confirm both landed:

```bash
gh api repos/OWNER/REPO/rulesets?includes_parents=true
```

## On another Postgres host

The RLS deny-all scheme under [`architecture.md`](architecture.md) S5 is not
Supabase-specific in principle, but its two conditions are stated in Supabase's
vocabulary. On any other host the question to answer before trusting it is the
same: **does the role in `DATABASE_URL` bypass RLS, and does it own the
tables?**

`db:check` reads that from the catalogue rather than assuming it, so run it and
read the output rather than porting the Supabase steps literally. What changes
is only step 2: there is no Data API to switch off, and no automatic-RLS
trigger — which makes `rls-guard.test.ts` the sole guard against a table that
forgot `withRLS()`, rather than one of two.
