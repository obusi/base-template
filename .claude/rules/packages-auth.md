---
paths:
  - "packages/auth/**/*"
---

# packages/auth

Better Auth, split into a half that may reach the browser and a half that must
not. Sign in, sign up, sign out and password reset go straight here from
`apps/web` — they do not travel through oRPC, and writing a contract for them
would be a mistake. `docs/architecture.md` S4 says why at length.

```
packages/auth/src/
├── server.ts     the server entry — `import "server-only"` + a re-export
├── client.ts     the browser entry — createAuthClient, no server imports
├── config.ts     the instance itself. NOT in the exports map
├── env.ts        the variables, validated
├── resend.ts     the one mailer this template ships
└── *.test.ts     config.test.ts, resend.test.ts
```

## Three entry points, and `config.ts` is deliberately not one

```jsonc
"exports": {
  "./server": "./src/server.ts",
  "./client": "./src/client.ts",
  "./env": "./src/env.ts"
}
```

`config.ts` is where the real work is, and it is unreachable from outside the
package on purpose — `@packages/auth/config` does not resolve. That omission is
load-bearing, because of the next rule.

## `config.ts` carries no `server-only`, and `server.ts` puts it back

```ts
// server.ts
import "server-only"
export { auth, createAuth, type Auth, type Session } from "./config"
```

Better Auth's schema generator loads `config.ts` with a plain import and
**refuses to run when the file contains `server-only`** — see
`docs/architecture.md` S10 (C13). So the marker lives one file up, where the
generator never looks and every real importer does. Adding `server-only` to
`config.ts` breaks `auth:generate`; removing it from `server.ts` puts the auth
secret one careless import away from the browser bundle.

`client.ts` imports neither `server-only` nor `@packages/db` nor `./server`.
Keeping the two halves in separate files is the whole reason the browser half
is safe to bundle.

## Everything optional is injected, never read from `env` inside the factory

```ts
export function createAuth(database: Database, options: AuthOptions = {}) { ... }

// config.ts, once, at the bottom:
export const auth = createAuth(db, { sendResetPassword: …, google: …, allowedHosts: … })
```

`sendResetPassword`, `google` and `allowedHosts` are arguments so a test can
pass a collector, throwaway OAuth credentials, or a hostname list without
setting a process-wide variable that every other test in the file would then
share. `config.test.ts` depends on all three being injectable.

The `database` is an argument for the same reason as everywhere else in this
repo — see `packages-conventions.md`. A test signs a real user up against a
throwaway PGlite instance; a module-level `db` would make that impossible, and
with it every auth rule a project adds later (blocked email domains, lockout, a
row created on signup).

**A new option follows the same shape:** add it to `AuthOptions`, read the
environment variable only in the `auth` export at the bottom, and leave the
factory free of `env`.

## Two options that must never be set

```ts
drizzleAdapter(database, {
  provider: "pg",
  schema,
  // 🚫 experimental: { joins: true }
})
```

It is the one adapter option that reaches for `db.query`, an API this repo's
Drizzle version removed — `docs/architecture.md` S10 (C10).

**`socialProviders` stays `undefined` when unconfigured, not `{}`.** An empty
object still makes `/sign-in/social` a live endpoint, and `config.test.ts` pins
`undefined` as what "off" means.

## The signup hook creates the profile row, and swallows its own failure

```ts
databaseHooks: { user: { create: { after: async (createdUser) => { try { … } catch { console.error(…) } } } } }
```

The `try` is not carelessness. `create.after` runs *after* the `user` insert has
already committed, so throwing cannot roll the signup back — it would turn a
successful signup into an error response and leave a user with no profile and no
way to retry, because signing up again with the same email just fails.
`profile.me` in `packages/api` creates the row on first read as the fallback for
exactly that case.

Any hook added here inherits the same constraint: it runs after the commit, so
it must not treat throwing as a way to refuse the signup.

## Schema and user fields belong to `packages/db`

Regenerating `schema/auth.ts` undoes three hand edits every time, and
`additionalFields` is not the place for business columns. Both rules, and what
catches you when you get them wrong, are in `packages-db.md`. Read it before
running:

```bash
pnpm --filter @packages/auth auth:generate
```

## The mailer is a seam, not a feature

`resend.ts` is twenty lines of `fetch` and a bearer token, wired in only when
`RESEND_API_KEY` is set. With no key, reset links go to the server log behind a
`console.warn` that says so — fine while developing, wrong once deployed, and
the warning is what keeps the convenience from becoming the production
behaviour.

A project that wants a different provider replaces the file, or deletes it and
passes its own `sendResetPassword`. Do not add a mail dependency here to make
that easier; the injection point already is the easy path.
