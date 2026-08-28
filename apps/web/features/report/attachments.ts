// The limits the browser checks before anything is uploaded — the same ones
// the server enforces, read from `@packages/contract` rather than written out
// again here. A form that hard-codes them tells the person "up to 5 MB" while
// the server has moved on, and they find out by watching an upload fail.
//
// Deliberately free of any import that reaches the network: `upload.ts` next
// door holds that half. Splitting them is what lets this file be tested by
// calling it, which is the only kind of test `apps/web` is meant to carry —
// see .claude/rules/testing.md.

import {
  AttachmentContentType,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
} from "@packages/contract"

const ALLOWED = AttachmentContentType.options

export type AttachmentContentTypeValue = (typeof ALLOWED)[number]

export type PickedFile = { type: string; size: number }

export type Attachment = {
  path: string
  contentType: AttachmentContentTypeValue
  size: number
}

/** A human-readable reason the selection cannot be sent, or `undefined`. */
export function validateAttachments(files: PickedFile[]): string | undefined {
  if (files.length > MAX_ATTACHMENTS) {
    return `Up to ${MAX_ATTACHMENTS} images.`
  }

  if (files.some((file) => !ALLOWED.includes(file.type as never))) {
    return "Images only — JPEG, PNG or WebP."
  }

  if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
    return `Each image must be under ${formatBytes(MAX_ATTACHMENT_BYTES)}.`
  }

  if (files.some((file) => file.size === 0)) {
    return "One of those files is empty."
  }

  return undefined
}

export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)

  return mb >= 1
    ? `${Math.round(mb * 10) / 10} MB`
    : `${Math.ceil(bytes / 1024)} KB`
}
