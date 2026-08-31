# Provisioning

The once-per-project half: a Supabase project, real environment values, the
schema, the first admin, and the branch rules. None of it can be carried in the
repository, because each step depends on something that does not exist until
somebody creates it.

Running the app on your own machine needs none of this — see
[`getting-started.md`](getting-started.md). Once these steps are done,
[`deploy.md`](deploy.md) covers the hosting itself.

This document says *what to do*. When a step turns on something surprising, it
links to [`architecture.md`](architecture.md), which says *why* — the reasoning
lives there and only there.

Steps 1–4 are needed by every deployment. Step 5 is needed once per repository
and applies only to GitHub.

---

## 1. Create the database

On Supabase, two options must be set **at project creation**. Not on Supabase?
See "On another Postgres host" below; the rest of this document is unchanged.

- **Enable Data API — off.** It publishes a REST endpoint that reaches the
  database with the anon key. Nothing here uses it, and nothing here uses the
  anon key at all: the one `@supabase/*` package in the repo is
  `@supabase/storage-js`, which lives in `packages/storage`, talks to Storage
  rather than to the database, and holds the service role key on the server. RLS
  deny-all is the wall; not opening this door at all is better.
- **Enable automatic RLS — on.** An event trigger enables RLS on every new
  table, as a backstop for tables created by hand in the SQL editor.

## 2. Fill in the environment values

Each variable is commented where it is declared. What follows is where a real
value comes from. The defaults sitting in `.env.example` are the local stack's,
covered in [`getting-started.md`](getting-started.md), and not one of them is
right for a deployment.

| Variable | File | Required | Where it comes from |
|---|---|---|---|
| `DATABASE_URL` | both | yes | the Supabase dashboard |
| `BETTER_AUTH_SECRET` | web | yes | generated, fresh per environment |
| `BETTER_AUTH_URL` | web | yes | the address the browser uses |
| `RESEND_API_KEY` | web | no | resend.com |
| `RESEND_FROM` | web | no | a domain Resend has verified |
| `GOOGLE_CLIENT_ID` | web | no | Google Cloud console |
| `GOOGLE_CLIENT_SECRET` | web | no | Google Cloud console |
| `SUPABASE_URL` | web | no | the Supabase dashboard |
| `SUPABASE_SERVICE_ROLE_KEY` | web | no | the Supabase dashboard |
| `BETTER_AUTH_ALLOWED_HOSTS` | web | no | nothing — see below |

Most of the optional ones are feature switches rather than settings, and each
absent pair simply removes its feature from the page: no `RESEND_API_KEY` sends
password-reset links to the server log, no Google pair means no "Continue with
Google" row, no Supabase pair means the report form has no file picker. The app
runs without any of them.

`BETTER_AUTH_ALLOWED_HOSTS` is the odd one out — not a feature but a deployment
detail, and one most projects never set. It names extra hostnames the origin
check should accept, which matters only where the hostname is not fixed, as on a
preview deployment that gets a new one every build. On Vercel that case is
already covered: `packages/auth/src/config.ts` reads `VERCEL_URL` and
`VERCEL_BRANCH_URL`, the two hostnames such a deployment answers to, so a custom
domain or a renamed project needs no edit. Set this only for a host Vercel
cannot report.

There is one more variable the table leaves out, because nothing writes it by
hand: **`POSTGRES_URL`**. Supabase's Vercel integration sets it on a preview
deployment, naming the database branch that belongs to that pull request, and
both `env.ts` files fall back to it when `DATABASE_URL` is unset. That fallback
is what gives a preview its own database. It never applies locally or in
production, where `DATABASE_URL` is set and wins.

That database arrives empty, so `apps/web/vercel.json` runs
`packages/db/scripts/deploy.ts` before the build. It applies the migrations, and
only when `VERCEL_ENV` is `preview` — production stays a hand-run `db:migrate`,
because a migration that goes wrong there cannot be thrown away with the pull
request.

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

Generate a fresh one per environment. It signs every session token, and the
value shipped in `.env.example` is a fixed development string that every clone
of this repository shares — carrying it into a deployment would mean anyone
could mint a session.

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

### `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — optional

The switch for attaching screenshots to a report. Leave both empty and the form
simply has no file picker; nothing else changes.

There is no third variable for the bucket's name. `supabase/config.toml`
declares `report-attachments`, and that declaration is what creates the bucket;
the code names the same string as `REPORT_BUCKET` in
`packages/api/src/domains/report/service.ts`. A variable pointing anywhere else
would only aim the app at a bucket nobody made.

`supabase/config.toml` declares the bucket, and that declaration is what creates
it: locally on `pnpm supabase:start`, on every preview branch, and on production
at the first merge into `main` — see [`deploy.md`](deploy.md) S3 for the switch
that makes the last one true. Nothing here is clicked, and the settings below
arrive with the bucket rather than being typed into a form. They are listed
because three of them are not cosmetic:

| Key | Value | What it is |
|---|---|---|
| the section name | `report-attachments` | must match `REPORT_BUCKET` in the code |
| `public` | `false` | nothing is readable without a URL this server signed |
| `file_size_limit` | `"5MiB"` | the only place a size is actually enforced |
| `allowed_mime_types` | the three image types | the only place a type is actually enforced, and must match `AttachmentContentType` |

Then Supabase → **Project Settings → API** for the two values above.
`SUPABASE_URL`
is the project URL; the key is the one labelled **`service_role`**, not `anon`.

**Why the last two are not optional.** The bytes go from the browser straight
to the bucket, so what a caller told this API about its own file was never more
than a claim — a request can declare "1 KB, image/png" and then PUT 40 MB of
something else. Measured against a live bucket with these settings on: a 7 MB
body declared as 1 KB is refused with `413 EntityTooLarge`, and a PDF declared
as `application/pdf` with `415 InvalidMimeType`. With them off, both are stored.

**Do not use `image/*`,** even though the setting accepts wildcards. It matches
`image/svg+xml`, and an SVG is a document that can carry script. The three
types listed above cannot.

The size and the type list are declared in three places that have to agree:
`packages/shared/src/contract/domains/report/attachment.ts`, the bucket above, and
`[storage.buckets.report-attachments]` in `supabase/config.toml`. A type the
contract allows and the bucket refuses fails after the person has waited for the
upload. When changing one, change all three.

**What this still does not stop.** Supabase checks the declared content type,
not the bytes: a file that is really HTML, uploaded as `image/png`, is stored.
It is junk rather than a hole — it comes back with `Content-Type: image/png`,
which browsers will not parse as a document, so it renders as a broken image
and nothing runs. Verified by uploading `<script>` bytes and opening the signed
URL directly. There is also no rate limit anywhere in this repo, so a signed-in
caller can fill the bucket; see [`architecture.md`](architecture.md) S4.

No policies are needed on the bucket. Same reasoning as RLS deny-all: the
server holds a key that bypasses them, and authorization lives in oRPC. The
service role key never leaves the server for the same reason — the browser is
handed a signed URL and uploads with `fetch`, so turning this on does not
reopen the Data API that step 1 above switched off.

### `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — optional

Both or neither, and they gate two things independently. `packages/auth` decides
whether the provider exists: `config.ts` registers it only when both are set,
and answers `PROVIDER_NOT_FOUND` otherwise. `apps/web` decides whether the
button is offered: `app/signin/page.tsx` reads the same pair and renders no
Google row without them — separator included, since an "Or" with nothing under
it looks worse than no row.

Hiding the button is not what secures anything; the server is. It is what stops
a fresh clone from showing a door that cannot open.

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

## 3. Apply the schema, then check it

```bash
pnpm db:migrate
pnpm db:check
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

**`cannot reach` is the expected result here**, because step 1 turned the Data
API off. `anon` and `authenticated` exist only to serve PostgREST; with it off
they are never granted USAGE on the schema, and Postgres reports a table in a
schema a role cannot use as nonexistent rather than as forbidden. A leaked key
cannot read those tables, and cannot discover that they exist.

Anything else is a real finding. The script lists what it found and exits
non-zero.

## 4. Make yourself an admin

`/report` works for anyone signed in. `/admin/reports`, where those reports are
read, answers 404 to everybody until somebody holds the role — and nothing in
the app grants it, on purpose: an endpoint that hands out admin is a bigger
risk than a one-off SQL statement. (The seeded `admin@example.com` exists on a
laptop and on preview branches, where `pnpm seed` has run. It is never created
on production — see [`deploy.md`](deploy.md) S5.)

Open `pnpm db:studio` and run it against your own account:

```sql
update profile set role = 'admin'
where user_id = (select id from "user" where email = 'you@example.com');
```

Sign out and back in is not needed — the role is read per request.

## 5. Protect the default branch

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
is only step 1: there is no Data API to switch off, and no automatic-RLS
trigger — which makes `rls-guard.test.ts` the sole guard against a table that
forgot `withRLS()`, rather than one of two.

Local development is unaffected either way — `pnpm supabase:start` serves the
same Postgres regardless of where the deployment ends up.
