// Relative imports, not the `@packages/shared/*` alias — see
// domains/post/contract.ts for why this package avoids the alias entirely.

import { oc } from "@orpc/contract"

import { commonErrors } from "../../errors"
import { CreateUploadUrlsInput, CreateUploadUrlsOutput } from "./attachment"
import {
  CreateReportInput,
  ListReportsInput,
  ListReportsOutput,
  ReportSchema,
  UpdateReportStatusInput,
} from "./schema"

export const reportContract = {
  // Called before `create`, once, with the files the person picked. It answers
  // with somewhere to PUT each one; the bytes never pass through this API.
  //
  // Two doors would be worse than one here: uploading through `/rpc` would put
  // 15 MB of image inside a JSON body, and a serverless request body limit is
  // a wall you meet in production rather than in review.
  createUploadUrls: oc
    .route({ method: "POST", path: "/reports/upload-urls" })
    .input(CreateUploadUrlsInput)
    .output(CreateUploadUrlsOutput)
    .errors({
      ...commonErrors,

      // Attachments are switched on by environment, the same way email is.
      // A deployment with no bucket configured says so instead of failing
      // somewhere deeper, and the form hides its file picker on this code.
      ATTACHMENTS_UNAVAILABLE: {},
    }),

  // Signed-in callers only. Anonymous reporting would mean an unauthenticated
  // write endpoint with a published OpenAPI description and no rate limiting
  // anywhere in this repo — see docs/architecture.md S5.
  create: oc
    .route({ method: "POST", path: "/reports" })
    .input(CreateReportInput)
    .output(ReportSchema)
    .errors(commonErrors),

  // Admins only, and the refusal is FORBIDDEN rather than NOT_FOUND. The
  // NOT_FOUND rule exists so that a caller cannot learn which ids are real by
  // the error they get back; this endpoint takes no id, so there is nothing
  // to discover and the honest answer is the useful one.
  list: oc
    .route({ method: "GET", path: "/reports" })
    .input(ListReportsInput)
    .output(ListReportsOutput)
    .errors(commonErrors),

  // Admins only, like `list`. PATCH on a sub-resource rather than on
  // `/reports/{id}`, because status is the only field this API will ever
  // change — a PATCH on the report itself would promise a general update that
  // deliberately does not exist.
  //
  // Answers with the bare report rather than the one `list` returns: the caller
  // already has the attachments and their signed URLs, and re-signing them on
  // every status change would buy nothing.
  //
  // Nothing here says the procedure is behind a feature flag, and that is not
  // an omission. `requireFeature` refuses with NOT_FOUND, which `commonErrors`
  // already declares, so guarding and releasing cost the contract no edit at
  // all — see packages/shared/src/features/.
  updateStatus: oc
    .route({ method: "PATCH", path: "/reports/{id}/status" })
    .input(UpdateReportStatusInput)
    .output(ReportSchema)
    .errors(commonErrors),
}
