// Translates between oRPC and ./service — see packages-api.md.

import { requireAuth } from "../../middleware/auth"
import { os } from "../../shared/builder"
import * as profileService from "./service"

export const me = os.profile.me
  .use(requireAuth)
  .handler(({ context }) =>
    profileService.getOrCreate(context.db, context.user.id)
  )

export const update = os.profile.update
  .use(requireAuth)
  .handler(({ context, input }) =>
    profileService.update(context.db, context.user.id, input)
  )

export const profileRouter = { me, update }
