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

Three kinds of file live here, and nothing else.

**Pages.** One thin wrapper per route, with an explicit function body rather
than a bare re-export — that leaves room for `generateMetadata`, a prefetch,
or a `<Suspense>` boundary later without another restructure:

```tsx
// app/posts/page.tsx
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

## `features/` — one folder per business domain

```
features/<name>/
├── index.ts         # public surface — the only thing another folder imports
├── <name>-page.tsx  # what app/<route>/page.tsx re-exports
└── components/      # used only inside this feature
```

**Naming.** Match `packages/contract`, `packages/db/schema`, or
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

**Ownership is about meaning, not about which route renders it.**
`SignOutButton` lives in `features/auth/`, not `features/post/`, even though
today only the posts page renders it — signing out is an auth action no
matter who triggers it. If you're placing a new file and the only reason it
feels post-shaped is "the posts page happens to use it," that's a sign to
check what the file is actually *about* before choosing its folder.

## `components/` and `hooks/` — feature-agnostic only

A component or hook earns a place here only when a **second, unrelated**
feature needs the exact same generic piece — a confirm dialog, a page header,
a `useDebounce`. Being rendered on two routes is not the test: if it carries
the meaning of one domain, it stays in that domain's `features/<name>/`, and
the other code imports it across the feature boundary instead of promoting
it up.

Both folders are currently empty (`.gitkeep` only). That's expected, not a
gap to fill preemptively — the template ships one example domain, so nothing
has needed cross-feature sharing yet.

## `lib/` and root config files — infrastructure, not a domain

`lib/` holds framework/platform wiring that every feature indirectly depends
on to run, never something with business meaning. Right now that's the oRPC
client switch (`orpc.ts`, `orpc.server.ts`, `orpc-query.ts` — see
`docs/architecture.md` §5). A new file belongs here only if it's the same
kind of thing — client setup, config plumbing — not if it does something a
specific domain cares about.

At the project root, `instrumentation.ts`, `env.ts`, `next.config.ts`,
`components.json`, `eslint.config.js`, `postcss.config.mjs`, and
`tsconfig.json` are configuration Next.js, TypeScript, or their tooling
require at that exact path. Leave them there even if the rest of this file
suggests grouping things into folders — the tool, not this convention,
decides where these live.

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
   any one-off action rather than displaying data. What
   `create-post-form.tsx` and `post-item.tsx` use.
2. **`useQuery(orpc.xxx.queryOptions())`** — data that changes from user
   interaction (search, filter, manual refresh) when nothing wraps the
   component in `<Suspense>`. The component checks `isLoading`/`isError`
   itself.
3. **`useSuspenseQuery(orpc.xxx.queryOptions())`** — the same situation as
   `useQuery`, but a `<Suspense>` boundary already wraps the component and
   should own the loading state instead of the component checking it.
4. **`useInfiniteQuery` / `useSuspenseInfiniteQuery`
   `(orpc.xxx.infiniteOptions())`** — "load more" or infinite scroll driven
   from the client. `post.list` already returns `nextCursor`, so it's ready
   for this without a contract change.

## Deciding where a new file goes

1. Is it a route file at a path Next.js dictates (`page.tsx`, `layout.tsx`,
   `route.ts`)? → `app/`, and it stays thin.
2. Does it belong to one specific business domain (has a subject: `post`,
   `auth`, or whatever comes next)? → `features/<domain>/`, private by
   default. Export it from that feature's `index.ts` only once something
   outside the feature needs it.
3. Is it generic UI or a generic hook, with no business meaning, and does a
   *second, unrelated* feature already need it? → `components/` or `hooks/`.
4. Is it wiring the whole app depends on to boot or run — client setup, env
   parsing, instrumentation — rather than something a domain cares about? →
   `lib/`, or a root config file if the tool requires that exact path.
5. None of the above cleanly fits? Ask rather than guess. An unclear case
   usually means the domain boundary itself isn't settled yet, and that's a
   decision for the human reviewing the template, not one to make silently.
