---
paths:
  - "packages/scripts/**/*"
---

# packages/scripts

A runner, not a library. Nothing imports it; it holds the commands that need the
real database and the real auth instance at the same time — today just `seed`.

Mostly typed by a person, but not only: `apps/web/vercel.json` runs `seed` in
every preview build. "Where may this run?" is therefore a real question here,
and the last section below is the answer.

```
packages/scripts/
├── package.json    no `exports` map, on purpose
└── src/seed.ts     one file per command
```

## No `exports` map, and that is the definition

Every other package in the repo declares what it exports, and
`packages-conventions.md` treats a missing map as the marker for "this is a
process rather than a library". Adding one here would be a claim that something
imports this package, which nothing does and nothing should. Add a `scripts`
entry to `package.json` instead.

It is also the one place allowed to name the real `db` outside
`packages/api/src/connection/live.ts`, and for a reason that does not generalise:
there is no caller to hand it one.

## Every command needs `tsx --conditions=react-server`

```jsonc
"seed": "tsx --conditions=react-server --env-file-if-exists=../../apps/web/.env src/seed.ts"
```

Three parts, each load-bearing, and a new command copies all three:

- **`tsx`** — bare `node` resolves ESM specifiers without adding extensions, so
  importing `@packages/auth/server` fails on that package's own extensionless
  `./config` import. The alternative was adding `.ts` to every relative import
  across `auth` and `db`, measured at about twenty edits and rejected as the
  larger change.
- **`--conditions=react-server`** — `server-only` throws outside a framework by
  design. This condition resolves it to the empty module. Without it the script
  dies on the first import, before running a line of its own.
- **`--env-file-if-exists=../../apps/web/.env`** — this package deliberately owns
  no `.env`. `seed` needs `DATABASE_URL`, `BETTER_AUTH_SECRET` and
  `BETTER_AUTH_URL` together and only `apps/web/.env` has all three. A copy here
  would drift silently in both directions: a different `DATABASE_URL` seeds a
  database the app never reads, a different `BETTER_AUTH_SECRET` creates users
  whose sessions the app cannot verify.

Add a root passthrough for anything a person runs often —
`"seed": "pnpm --filter @packages/scripts seed"` in the root `package.json`, so
the commands a fresh clone runs read as one list.

## Close the pool, or the script hangs after finishing

```ts
try {
  await seed()
} finally {
  await closeDb()
}
```

The shared `db` holds an idle connection open, so a script that finishes its
work and returns still never exits — which reads as a script that failed rather
than one that is done. `closeDb` exists for exactly this; `packages/db` does not
export `client`, so there is no other way to release it. `packages-db.md` has
the reasoning.

## Go through the real code path, not around it

`seed.ts` signs both accounts up through Better Auth rather than inserting `user`
rows, because the password has to be hashed the way sign-in will verify it. That
is also why `[db.seed]` is off in `supabase/config.toml` — a `seed.sql` cannot
hash a password.

Same rule for anything added here: a script that writes what the app reads
should use the app's own entry point. Reaching past it produces rows that look
right and behave wrongly.

**Running it twice must be safe.** `seed` checks for the account first and says
so rather than failing. Against a database with no tables it exits non-zero
rather than warning, because a silent success there is worse than a stack trace.

## No tests here yet

There is no `test` script, and `seed.ts` is untested. That is a known gap
rather than a decision. A command that grows any logic worth getting wrong
should arrive with a test file and the `test` script every other package
already has.

## A command a deployment runs decides for itself where it may run

`apps/web/vercel.json` has one `buildCommand`, and every deployment uses it —
preview and production alike. So a command added to that string cannot be
"preview only" by being written there; it is preview only by refusing anywhere
else:

```ts
if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "preview") {
  console.log(`seed: VERCEL_ENV is ${process.env.VERCEL_ENV} …`)
  process.exit(0)
}
```

Two things about that shape are the point.

**It is in the script, not in the JSON.** A shell condition inside a JSON
string is unreadable, untypecheckable and untestable, and what it is guarding
here is an admin account whose password is written down in three docs.
`packages/db/scripts/deploy.ts` makes the same call for the same reason.

**The test is "set and not preview", not "is preview".** `VERCEL_ENV` is unset
on a laptop, which is the case the command exists for, so unset has to keep
meaning yes. Inverting it would make `pnpm seed` a no-op on the one machine
that needs it, and silently — the failure would look like a database that
seeded and then lost the rows.

`db:deploy` guards the other way (unset means no, because nothing but a build
ever runs it), which is worth noticing rather than copying: the right default
is whichever one is safe when the platform says nothing.
