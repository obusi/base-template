import { ORPCError } from "@orpc/server"

import type { Feature } from "@packages/shared"

import { os } from "../shared/builder"

/**
 * Refuses a procedure whose flag is off.
 *
 * Hiding the button is not the same as not shipping the feature. `/rpc` takes
 * requests from anywhere, `/api/v1` serves the same router as REST, and
 * `/api/spec` publishes how to call it — so a procedure guarded only in the UI
 * is a procedure anyone can run. This is the half that decides; the UI half
 * decides what a person sees.
 *
 * `NOT_FOUND` rather than `FORBIDDEN`, and the reason is the one
 * `requireAdminPage` gives for answering 404: refusing with "you may not"
 * confirms the thing is there. A feature that has not been released should not
 * announce that it exists and is merely switched off.
 *
 * It costs no contract change either — `NOT_FOUND` is in `commonErrors`, so
 * every procedure already declares it. Guarding one is `.use(...)` and one
 * line, and releasing it is deleting that line.
 */
export function requireFeature(feature: Feature) {
  return os.middleware(async ({ context, next }) => {
    if (!context.features.isOn(feature)) {
      throw new ORPCError("NOT_FOUND")
    }

    return next()
  })
}
