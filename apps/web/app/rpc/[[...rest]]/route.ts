// The HTTP door into the API — used by Client Components and, later, by the
// mobile app. Server Components skip it entirely and call the router in
// process; see lib/orpc.ts.

import { onError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { headers } from "next/headers"

import { router } from "@packages/api"
import { liveContext } from "@packages/api/live"

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      // Errors the contract declares are expected outcomes on their way to a
      // UI message. Everything else is a bug and belongs in the log. Swapping
      // console for Sentry later is a change to this block alone.
      console.error(error)
    }),
  ],
})

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: "/rpc",
    context: liveContext(await headers()),
  })

  return response ?? new Response("Not found", { status: 404 })
}

// All six, not just GET and POST: oRPC chooses the method per procedure, and a
// missing export turns into a 405 that reads like a client bug.
export const HEAD = handleRequest
export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
