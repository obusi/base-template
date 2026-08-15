// The REST door into the same router /rpc serves.
//
// Two protocols, one set of procedures. `/rpc` speaks oRPC's own format and is
// what this app's own client uses — it carries Dates and Maps intact and needs
// no route declarations. `/api/v1` speaks plain HTTP with the paths and methods
// declared by `.route()` in the contract, which is what a third party with curl
// or a language other than TypeScript can actually use.
//
// Under /api/v1 rather than /api, because /api/auth already belongs to Better
// Auth and two catch-alls at the same level would be ambiguous.

import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { onError } from "@orpc/server"
import { experimental_ZodSmartCoercionPlugin } from "@orpc/zod/zod4"
import { headers } from "next/headers"

import { router } from "@packages/api"
import { liveContext } from "@packages/api/connection/live"

const handler = new OpenAPIHandler(router, {
  plugins: [
    // A URL carries no types: `?limit=20` arrives as the string "20", which the
    // contract's `z.number()` would reject. This coerces against the schema
    // rather than guessing.
    //
    // Still prefixed `experimental_` on the Zod 4 path — the plain
    // `ZodSmartCoercionPlugin` name exists only on the package root, which
    // reads Zod 3 schemas.
    new experimental_ZodSmartCoercionPlugin(),
  ],
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: "/api/v1",
    context: liveContext(await headers()),
  })

  return response ?? new Response("Not found", { status: 404 })
}

export const HEAD = handleRequest
export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
