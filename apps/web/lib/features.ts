// Which flags this deployment has on, for everything in `apps/web` that runs
// on the server: pages, layouts, route handlers.
//
// `server-only` is the enforcement, not a note. A flag read in the browser is
// a flag whose guarded code was shipped to the browser, and the names alone
// would say what is being built before it is announced. A client component
// that imports this fails the build instead — which is the point: it should
// take a decided answer as a prop (`canEdit={...}`), not the flag.
//
// `packages/api` answers the same question from its own copy of this value.
// The two are not a duplicate rule: this one decides what a person is shown,
// and the procedure behind it refuses them anyway. Same shape as the role
// guards in `features/auth/role.ts`.
import "server-only"

import { FEATURES, parseFeatures } from "@packages/shared"

import { env } from "@/env"

export const features = parseFeatures(env.FEATURES, FEATURES)
