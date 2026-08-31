---
paths:
  - "apps/web/**/*"
---

# apps/web structure

`apps/web` splits into two layers:

```
app/            routing only — thin pages + HTTP handlers, no logic
features/<x>/   one folder per business domain — the actual UI and logic
components/     UI shared by 2+ unrelated features (usually empty)
hooks/          hooks shared by 2+ unrelated features (usually empty)
lib/            app-wide infrastructure — not a domain
```

`app/` never contains logic; it only imports and renders what `features/`
exports. Everything a page does — fetch data, assemble the layout, handle a
form — lives in the matching `features/<name>/` folder. `components/`,
`hooks/`, and `lib/` exist only to hold what genuinely doesn't belong to one
domain — not as a default dumping ground.

The rest of this file works through each piece in that order: `app/`, then
`features/`, then the shared and infrastructure folders, then how data
fetching fits into all of it.

## `app/` — routing only

Four kinds of file live here, and nothing else.

**Pages.** One thin wrapper per route, with an explicit function body rather
than a bare re-export — that leaves room for `generateMetadata`, a prefetch,
or a `<Suspense>` boundary later without another restructure:

```tsx
// app/(app)/(user)/posts/page.tsx
import { PostsPage } from "@/features/post"

export default function Page() {
  return <PostsPage />
}
```

**HTTP door handlers** — `app/api/auth/`, `app/rpc/`, `app/api/v1/`,
`app/api/spec/`, `app/api/docs/`. These expose `packages/api` and Better Auth
over HTTP; they are infrastructure, not features. There are exactly three
doors (`/api/auth`, `/rpc`, `/api/v1`) plus the two files describing
`/api/v1` (`/api/spec`, `/api/docs`). A new business domain never needs a new
folder here — it adds procedures to the router in `packages/api`, and those
become reachable through the doors that already exist.

**Root wiring** — `app/layout.tsx`, `app/providers.tsx`. Used exactly once,
by the framework itself. Not a feature, and not a shared component either:
`Providers` is technically a component, but the reuse rule below is about
things used in more than one place, and this is used in exactly one.

**Segment guards** — a `layout.tsx` whose job is to decide who may see
everything under it. The app has three route groups, and the guard is what
each one is for:

```
app/(app)/layout.tsx           the navbar, shared by all three
├── (user)/                    requireUserPage()   →  /, /posts
├── (admin)/                   requireAdminPage()  →  /admin, /admin/reports
└── (account)/                 no role guard       →  /profile, /report
```

A route group never appears in a URL, so `/posts` is still `/posts`. What it
buys is that **a page is guarded by where it sits** rather than by whoever adds
it remembering — the second admin page is where a per-page check gets
forgotten. `(admin)` holds the guard and the `admin/` folder inside it holds
the URL segment; two folders because they do two different jobs.

`(account)` has a layout that guards nothing, on purpose. Its pages belong to
whoever is signed in rather than to either side, and the file says so — the
omission is a decision, and a decision that is not written down reads as an
oversight to the next person.

Three things to keep straight when writing one:

**It is not what secures the data.** `requireUserRole` and `requireAdminRole`
in `packages/api` refuse the procedures and would refuse them if these layouts
were deleted. A layout only decides what a refused person sees.

**What they see is not the same on both sides.** The admin side answers 404,
because a back-office route confirming it exists is the thing `NOT_FOUND`
avoids on the API side too. The user side redirects to `/admin`, because an
admin landing there has taken a wrong turn rather than found something secret,
and a dead end is the less useful answer. `features/auth/role.ts` carries that
reasoning next to the two functions.

**A layout does not re-render on a client-side navigation inside its own
segment**, so a page whose data can start refusing mid-session still needs to
handle that itself. `features/report/admin-reports-page.tsx` carries that
backstop and says so.

## `features/` — one folder per business domain

```
features/<name>/
├── index.ts         # public surface — the only thing another folder imports
├── <name>-page.tsx  # what app/<route>/page.tsx re-exports
└── components/      # used only inside this feature
```

**Naming.** Match `packages/shared`, `packages/db/schema`, or
`packages/api/router` when the domain already has a name there — singular
(`post`, not `posts`). Otherwise name the folder after the domain, not the
route (`auth`, not `login`): the URL can change without the code needing to.

**The `index.ts` boundary.** Nothing outside a feature reaches past its
`index.ts` — not an `app/` route, and not another feature. If `features/post/`
needs `SignOutButton`, it imports it from `features/auth`'s `index.ts`, never
from `features/auth/components/sign-out-button.tsx` directly. Anything inside
`features/post/components/` is invisible outside `features/post/`. This is
what keeps a feature's internals free to change without hunting down every
importer.

**A barrel that exports Server Components cannot be imported from a Client
Component**, and the failure is a build error rather than a type error. Most
feature barrels export a `<name>-page.tsx` that reaches `lib/session.ts`, and
that file carries `server-only`; a `"use client"` file importing the barrel
pulls the marker into the browser graph and the build stops with
`module-not-found`.

The fix is not to reach past the barrel. It is to move the import up to
something that already runs on the server — usually the `app/` route, or
`components/nav-bar.tsx`, which composes one row out of several features
anyway — and pass the result down as a prop. `UserMenu` takes its
"Report a problem" entry that way: `features/report` owns the item, the navbar
imports it, and `UserMenu` renders whatever it is handed.

The general shape: **a Client Component receives cross-feature pieces, it does
not fetch them.**

**Ownership is about meaning, not about which route renders it.** A
`SignOutButton` belongs in `features/auth/` even if the only page that renders
it today is some other feature's — signing out is an auth action no matter who
triggers it. If you're placing a new file and the only reason it feels like it
belongs to a feature is "that feature's page happens to use it," that's a sign
to check what the file is actually *about* before choosing its folder.

## `components/` and `hooks/` — feature-agnostic only

A component or hook earns a place here only when a **second, unrelated**
feature needs the exact same generic piece — a confirm dialog, a page header,
a `useDebounce`. Being rendered on two routes is not the test: if it carries
the meaning of one domain, it stays in that domain's `features/<name>/`, and
the other code imports it across the feature boundary instead of promoting
it up.

Empty is the normal state for both, especially early on. That's not a gap to
fill preemptively — until a second feature exists, nothing can have earned a
place here yet.

## `lib/` and root config files — infrastructure, not a domain

`lib/` holds framework/platform wiring that every feature indirectly depends
on to run, never something with business meaning. Right now that's the oRPC
client switch (`orpc.ts`, `orpc.server.ts`, `orpc-query.ts` — see
`docs/architecture.md` S4), `session.ts`, and `features.ts`. A new file
belongs here only if it's the same kind of thing — client setup, config
plumbing — not if it does something a specific domain cares about.

`features.ts` carries `import "server-only"`, and that marker is the rule
rather than a note: a client component that imports it fails the build. A flag
read in the browser is a flag whose guarded code was shipped to the browser.
Branch in the Server Component and pass the answer down — `canEdit={...}`,
named for what the component may do, so releasing the feature costs that
component no edit. The procedure behind the page refuses a caller anyway; see
`packages-conventions.md` for the whole checklist.

At the project root, `instrumentation.ts`, `env.ts`, `next.config.ts`,
`components.json`, `eslint.config.js`, `postcss.config.mjs`, and
`tsconfig.json` are configuration Next.js, TypeScript, or their tooling
require at that exact path. Leave them there even if the rest of this file
suggests grouping things into folders — the tool, not this convention,
decides where these live.

## Server vs Client Components

Default to a Server Component. Add `"use client"` only to the smallest piece
that actually needs a hook, an event handler, or a browser API — never to the
page or layout it sits inside. A `"use client"` at the top of `page.tsx` turns
everything under it into client-rendered code too, including children that
never touch `useState`.

The shape that repeats across `features/`: a Server Component `<name>-page.tsx`
fetches what the page needs — `await client.xxx()`, `await getSession()` — and
passes the result down as props to a small client component that owns only the
interactive part:

```
posts-page.tsx        (server, fetches the list)
  └─ post-item.tsx     ("use client", owns edit/delete state)

profile-page.tsx       (server, fetches the profile)
  └─ profile-form.tsx  ("use client", owns the form)

nav-bar.tsx            (server, reads the session)
  └─ user-menu.tsx     ("use client", owns the dropdown + sign out)
```

This is also why `NavBar` is an `async function` rather than a plain one:
reading the session belongs on the server, so the HTML that leaves it is
already correct instead of flashing the signed-out state while a client-side
check catches up.

The one deliberate exception: a page that is *itself* one interactive form,
front to back — `signin-page.tsx`, `signup-page.tsx` — is a Client Component
at the top level rather than a server shell wrapped around a form leaf.
Splitting it further would not move meaningfully more code out of the client
bundle (the non-interactive parts, like `AuthHeader`, are a few lines of
markup) and would add a component split for its own sake. Treat this as the
exception, not the default: reach for it only when close to nothing is left
to render on the server once the interactive part is factored out.

## Data fetching

Same underlying question either way: is the data needed the moment the page
renders, or does it change because of something the user does in the
browser? The first case is a Server Component concern; the second is a
Client Component concern.

### Server Component — data needed at render time

1. **`await client.xxx()` directly.** The default. Use this when nothing
   downstream reads the same data through TanStack Query.
2. **`queryClient.prefetchQuery(orpc.xxx.queryOptions())` +
   `<HydrationBoundary>`.** Use this instead when a client component further
   down the tree calls `useQuery`/`useInfiniteQuery` on the same procedure.
   Without it, the browser refetches data the server already fetched — a
   duplicate request. With it, the server's result seeds the cache and the
   client reads it for free.

### Client Component — data driven by user interaction

1. **`useMutation(orpc.xxx.mutationOptions())`** — create/update/delete, or
   any one-off action rather than displaying data. What a form or a row's
   action buttons use.
2. **`useQuery(orpc.xxx.queryOptions())`** — data that changes from user
   interaction (search, filter, manual refresh) when nothing wraps the
   component in `<Suspense>`. The component checks `isLoading`/`isError`
   itself.
3. **`useSuspenseQuery(orpc.xxx.queryOptions())`** — the same situation as
   `useQuery`, but a `<Suspense>` boundary already wraps the component and
   should own the loading state instead of the component checking it.
4. **`useInfiniteQuery` / `useSuspenseInfiniteQuery`
   `(orpc.xxx.infiniteOptions())`** — "load more" or infinite scroll driven
   from the client. Any list procedure that returns a `nextCursor` is ready
   for this without a contract change; see `packages-shared.md` for the
   keyset-paging shape that makes it work.

## Deciding where a new file goes

1. Is it a route file at a path Next.js dictates (`page.tsx`, `layout.tsx`,
   `route.ts`)? → `app/`, and it stays thin.
2. Does it belong to one specific business domain — does it have a subject,
   the way `auth` or `billing` does? → `features/<domain>/`, private by
   default. Export it from that feature's `index.ts` only once something
   outside the feature needs it.
3. Is it generic UI or a generic hook, with no business meaning, and does a
   *second, unrelated* feature already need it? → `components/` or `hooks/`.
4. Is it wiring the whole app depends on to boot or run — client setup, env
   parsing, instrumentation — rather than something a domain cares about? →
   `lib/`, or a root config file if the tool requires that exact path.
5. None of the above cleanly fits? Ask rather than guess. An unclear case
   usually means the domain boundary itself isn't settled yet, and that is a
   decision for the human reviewing the work, not one to make silently.
