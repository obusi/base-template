// One import for both halves of the app.
//
// In the browser this is an HTTP client pointed at /rpc. On the server
// `orpc.server.ts` has already replaced it with a client that calls the router
// in the same process — no socket, no round trip to our own machine, and the
// browser bundle never sees the router.
//
// Every import here is type-only apart from the two client constructors, so
// nothing from `@packages/api` reaches the browser.

import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { RouterClient } from "@orpc/server"

import type { router } from "@packages/api"

declare global {
  var $client: RouterClient<typeof router> | undefined
}

const link = new RPCLink({
  url: () => {
    if (typeof window === "undefined") {
      // Reaching this means `orpc.server.ts` did not run, and the server is
      // about to make an HTTP request to itself. Failing loudly beats a
      // deadlock under load.
      throw new Error("RPCLink is not allowed on the server side.")
    }

    return `${window.location.origin}/rpc`
  },
})

export const client: RouterClient<typeof router> =
  globalThis.$client ?? createORPCClient(link)
