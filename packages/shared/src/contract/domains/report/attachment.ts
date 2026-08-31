// What a project may attach to a report, and the limits every layer reads.
//
// These three constants are exported from the package entry so the browser
// enforces the same numbers the server does. A form that hard-codes "5 MB"
// drifts the first time the server changes its mind, and the person finds out
// by having an upload rejected after waiting for it.

import { z } from "zod"

/** Images only, and only formats a browser renders without a plugin. */
export const AttachmentContentType = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
])

export const MAX_ATTACHMENTS = 3

/** Bytes. Large enough for a full-page screenshot, small enough to upload. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

/**
 * One file the caller is about to upload. Sent before the report exists, to
 * get somewhere to put it.
 */
export const UploadRequestSchema = z.object({
  contentType: AttachmentContentType,
  size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
})

export const CreateUploadUrlsInput = z.object({
  files: z.array(UploadRequestSchema).min(1).max(MAX_ATTACHMENTS),
})

export const CreateUploadUrlsOutput = z.object({
  targets: z.array(
    z.object({
      // Where the object will live. The caller sends this back with the
      // report; it does not get to choose it.
      path: z.string(),

      // Where to PUT the bytes. Short-lived, and the only thing in this
      // response that is a secret.
      uploadUrl: z.url(),
    })
  ),
})

/** One uploaded file, named in the report that follows. */
export const AttachmentInput = z.object({
  path: z.string().max(500),
  contentType: AttachmentContentType,
  size: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
})

export const AttachmentSchema = z.object({
  id: z.uuid(),
  contentType: z.string(),
  size: z.number().int(),

  // Signed when the row is read, never stored. See the table's own comment:
  // an expired URL in a database is indistinguishable from a working one.
  url: z.string(),
})
