// No `server-only` here, and no import of `@packages/db` or of `./server` —
// this file is meant to end up in the browser bundle. Keeping the two halves
// of this package in separate files is what makes that safe.

import { createAuthClient } from "better-auth/react"

// `baseURL` is deliberately omitted: the client reads `window.location.origin`,
// so the same code works on localhost, on preview deploys, and in production
// without an extra NEXT_PUBLIC_ variable to keep in sync. A future mobile app
// talks to a different origin and will need its own client that passes one.
export const authClient = createAuthClient()

export const { signIn, signUp, signOut, useSession } = authClient
