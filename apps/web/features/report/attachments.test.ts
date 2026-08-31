import { describe, expect, it } from "vitest"

import { MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "@packages/shared"

import { formatBytes, validateAttachments } from "./attachments"

const png = { type: "image/png", size: 1024 }

describe("validateAttachments", () => {
  it("accepts nothing at all", () => {
    expect(validateAttachments([])).toBeUndefined()
  })

  it("accepts the maximum number of images", () => {
    const files = Array.from({ length: MAX_ATTACHMENTS }, () => png)

    expect(validateAttachments(files)).toBeUndefined()
  })

  it("refuses one image too many", () => {
    const files = Array.from({ length: MAX_ATTACHMENTS + 1 }, () => png)

    expect(validateAttachments(files)).toContain(String(MAX_ATTACHMENTS))
  })

  it("refuses a file that is not an image the browser renders", () => {
    expect(validateAttachments([{ type: "application/pdf", size: 10 }])).toBe(
      "Images only — JPEG, PNG or WebP."
    )
  })

  it("accepts a file exactly on the size limit", () => {
    expect(
      validateAttachments([{ ...png, size: MAX_ATTACHMENT_BYTES }])
    ).toBeUndefined()
  })

  it("refuses a file one byte over it", () => {
    expect(
      validateAttachments([{ ...png, size: MAX_ATTACHMENT_BYTES + 1 }])
    ).toBeDefined()
  })

  it("refuses an empty file", () => {
    expect(validateAttachments([{ ...png, size: 0 }])).toBeDefined()
  })
})

describe("formatBytes", () => {
  it("reads in megabytes once there is a megabyte to read", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB")
  })

  it("reads in kilobytes below that", () => {
    expect(formatBytes(2048)).toBe("2 KB")
  })
})
