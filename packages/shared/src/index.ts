// Everything both sides of the app have to agree on. Today that is the API
// surface as described and nothing more — `packages/api` implements this
// shape, `apps/web` calls it, and a future Expo app imports this and only
// this.

// Re-exported so forms can build on the same schemas the server validates
// with — `CreatePostInput.extend({ ... })` rather than a second declaration
// that drifts. See docs/architecture.md S6. Named, not `export *`:
// only what a caller outside this package actually imports today.
export {
  CreatePostInput,
  UpdatePostInput,
  type Post,
} from "./contract/domains/post/schema"

export {
  UpdateProfileInput,
  type Profile,
} from "./contract/domains/profile/schema"

export {
  CreateReportInput,
  ReportCategory,
  type Report,
} from "./contract/domains/report/schema"

// The browser enforces the same limits the server does, from the same
// constants. A form that hard-codes them tells the person "5 MB" while the
// server has moved on, and they find out by having an upload rejected.
export {
  AttachmentContentType,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
} from "./contract/domains/report/attachment"

import { postContract } from "./contract/domains/post/contract"
import { profileContract } from "./contract/domains/profile/contract"
import { reportContract } from "./contract/domains/report/contract"

export const contract = {
  post: postContract,
  profile: profileContract,
  report: reportContract,
}
