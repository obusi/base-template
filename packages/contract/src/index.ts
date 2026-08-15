// The whole API surface, described and nothing more. There is no executable
// logic in this package — `packages/api` implements this shape, `apps/web`
// calls it, and a future Expo app imports this and only this.

// Re-exported so forms can build on the same schemas the server validates
// with — `CreatePostInput.extend({ ... })` rather than a second declaration
// that drifts. See docs/architecture.md section 7. Named, not `export *`:
// only what a caller outside this package actually imports today.
export {
  CreatePostInput,
  UpdatePostInput,
  type Post,
} from "./domains/post/schema"

import { postContract } from "./domains/post/contract"

export const contract = {
  post: postContract,
}
