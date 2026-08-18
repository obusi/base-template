// Translates between oRPC and ./service — see packages-api.md.

import { requireAuth } from "../../middleware/auth"
import { os } from "../../shared/builder"
import * as service from "./service"

export const me = os.profile.me
  .use(requireAuth)
  .handler(({ context }) =>
    service.getOrCreateProfile(context.db, context.user.id)
  )

export const update = os.profile.update
  .use(requireAuth)
  .handler(({ context, input }) =>
    service.updateProfile(context.db, context.user.id, input)
  )

export const profileRouter = { me, update }
