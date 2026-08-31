// Example domain — delete alongside schema.ts when starting a real project.
//
// Relative imports, not the `@packages/shared/*` alias. This is the one
// package a future Expo app compiles through Metro, whose handling of package
// `exports` maps and self-referencing imports has been the source of enough
// bundler bugs to be worth avoiding. Nothing inside this folder needs the
// alias to be readable.

import { oc } from "@orpc/contract"
import { z } from "zod"

import { commonErrors } from "../../errors"
import {
  AllPostsOutput,
  CreatePostInput,
  ListPostsInput,
  ListPostsOutput,
  PostIdInput,
  PostSchema,
  UpdatePostInput,
} from "./schema"

// `.route()` is what the OpenAPI handler and the generated spec read. The RPC
// protocol at /rpc ignores it entirely and addresses procedures by their path
// in this object, so adding routes costs the existing clients nothing — it just
// gives the same procedures a second, REST-shaped door.
export const postContract = {
  list: oc
    .route({ method: "GET", path: "/posts" })
    .input(ListPostsInput)
    .output(ListPostsOutput),

  // The unpaged twin of `list`, here to show the shape a bounded collection
  // uses — a dropdown of categories, the statuses a report can hold, one
  // caller's saved addresses. It takes no input and answers with everything.
  //
  // **Posts are not such a collection, and this procedure is a bad fit for
  // them on purpose**: the example domain is the only place in the repo with
  // enough rows to demonstrate anything, and it is deleted before a project
  // ships. Copy the shape, then ask whether the table it points at can grow
  // without limit. If a person can keep adding rows to it, or the answer needs
  // a filter, it is a `list` — see `.claude/rules/packages-api.md`.
  //
  // The REST path is the awkward part of sharing a resource with `list`: a
  // real bounded collection is its own resource and answers at `/categories`,
  // not at a sub-path of something else. Declared ahead of `byId` so the
  // literal segment is matched before `{id}` would swallow it.
  all: oc.route({ method: "GET", path: "/posts/all" }).output(AllPostsOutput),

  byId: oc
    .route({ method: "GET", path: "/posts/{id}" })
    .input(PostIdInput)
    .output(PostSchema)
    .errors({
      NOT_FOUND: commonErrors.NOT_FOUND,
    }),

  create: oc
    .route({ method: "POST", path: "/posts" })
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

  // PATCH, not PUT: every field of UpdatePostInput except `id` is optional, so
  // a request that omits `content` leaves it alone rather than clearing it.
  update: oc
    .route({ method: "PATCH", path: "/posts/{id}" })
    .input(UpdatePostInput)
    .output(PostSchema)
    .errors(commonErrors),

  // Returns the deleted id rather than nothing: the client needs it to drop
  // the row from its cache, and `void` would make the call indistinguishable
  // from one that silently did nothing.
  delete: oc
    .route({ method: "DELETE", path: "/posts/{id}" })
    .input(PostIdInput)
    .output(PostIdInput)
    .errors(commonErrors),
}
