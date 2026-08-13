// The whole API surface, described and nothing more. There is no executable
// logic in this package — `packages/api` implements this shape, `apps/web`
// calls it, and a future Expo app imports this and only this.

import { postContract } from "./post/contract"

export const contract = {
  post: postContract,
}

export type Contract = typeof contract

export { commonErrors } from "./errors"

// Re-exported so forms can build on the same schemas the server validates
// with — `CreatePostInput.extend({ ... })` rather than a second declaration
// that drifts. See docs/architecture.md section 7.
export * from "./post/schema"
