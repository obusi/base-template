import { oc } from "@orpc/contract"

import { commonErrors } from "../../shared/errors"
import { ProfileSchema, UpdateProfileInput } from "./schema"

export const profileContract = {
  // No input: the caller is always the signed-in user, from the session.
  me: oc
    .route({ method: "GET", path: "/profile/me" })
    .output(ProfileSchema)
    .errors(commonErrors),

  update: oc
    .route({ method: "PATCH", path: "/profile/me" })
    .input(UpdateProfileInput)
    .output(ProfileSchema)
    .errors(commonErrors),
}
