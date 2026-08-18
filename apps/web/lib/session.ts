// A page and the navbar wrapping it both need to know who is signed in, and
// both used to call `auth.api.getSession` independently. Better Auth refreshes
// a session's expiry on read, and two of those refreshes landing for the same
// request raced often enough to throw FAILED_TO_GET_SESSION — its own defence
// against a session row disappearing out from under a concurrent update.
//
// `cache()` (React, not Next's data cache) memoizes this per request: every
// caller within one render gets the same promise, so the refresh runs once.

import "server-only"

import { cache } from "react"
import { headers } from "next/headers"

import { auth } from "@packages/auth/server"

export const getSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() })
})
