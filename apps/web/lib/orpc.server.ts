// Runs once per server process, from instrumentation.ts, before any request is
// handled. It swaps the HTTP client in `orpc.ts` for one that calls the router
// directly, so a Server Component awaiting `client.post.list()` runs the
// handler in the same process instead of issuing a request to its own /rpc.

import "server-only"

import { createRouterClient } from "@orpc/server"
import { headers } from "next/headers"

import { router } from "@packages/api"
import { liveContext } from "@packages/api/live"

// A function, not an object: `headers()` is per-request, so the context has to
// be built when a procedure is called rather than when this module loads.
globalThis.$client = createRouterClient(router, {
  context: async () => liveContext(await headers()),
})
