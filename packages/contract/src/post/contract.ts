// Example domain — delete alongside schema.ts when starting a real project.
//
// Relative imports, not the `@packages/contract/*` alias. This is the one
// package a future Expo app compiles through Metro, whose handling of package
// `exports` maps and self-referencing imports has been the source of enough
// bundler bugs to be worth avoiding. Nothing inside this folder needs the
// alias to be readable.

import { oc } from "@orpc/contract"
import { z } from "zod"

import { commonErrors } from "../errors"
import {
  CreatePostInput,
  ListPostsInput,
  ListPostsOutput,
  PostIdInput,
  PostSchema,
  UpdatePostInput,
} from "./schema"

export const postContract = {
  list: oc.input(ListPostsInput).output(ListPostsOutput),

  byId: oc.input(PostIdInput).output(PostSchema).errors({
    NOT_FOUND: commonErrors.NOT_FOUND,
  }),

  create: oc
    .input(CreatePostInput)
    .output(PostSchema)
    .errors({
      ...commonErrors,

      // Declared with its limit attached so the client can say "you can have
      // 50" rather than "too many". A code with no data forces the UI to
      // hard-code a number that then drifts from the server's.
      QUOTA_EXCEEDED: {
        data: z.object({ limit: z.number().int() }),
      },
    }),

  update: oc.input(UpdatePostInput).output(PostSchema).errors(commonErrors),

  // Returns the deleted id rather than nothing: the client needs it to drop
  // the row from its cache, and `void` would make the call indistinguishable
  // from one that silently did nothing.
  delete: oc.input(PostIdInput).output(PostIdInput).errors(commonErrors),
}
