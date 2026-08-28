// The half of attaching images that talks to the network. Kept apart from
// `attachments.ts` so the limit checks there stay callable from a test without
// dragging the RPC client into it.

import { client } from "@/lib/orpc"

import type { Attachment, AttachmentContentTypeValue } from "./attachments"

/**
 * Ask the server where to put each file, PUT them straight there, and hand
 * back what the report needs in order to name them.
 *
 * The bytes never pass through `/rpc`. That is not an optimisation: a
 * serverless request body limit is a wall you meet in production rather than
 * in review, and three 5 MB images inside a JSON body would find it.
 */
export async function uploadAttachments(files: File[]): Promise<Attachment[]> {
  if (files.length === 0) return []

  const { targets } = await client.report.createUploadUrls({
    files: files.map((file) => ({
      contentType: file.type as AttachmentContentTypeValue,
      size: file.size,
    })),
  })

  // Paired by index: `createUploadUrls` answers in the order it was asked.
  const uploads = targets.flatMap((target, index) => {
    const file = files[index]

    return file ? [{ target, file }] : []
  })

  await Promise.all(
    uploads.map(async ({ target, file }) => {
      const response = await fetch(target.uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      })

      if (!response.ok) {
        throw new Error(`upload failed with ${response.status}`)
      }
    })
  )

  return uploads.map(({ target, file }) => ({
    path: target.path,
    contentType: file.type as AttachmentContentTypeValue,
    size: file.size,
  }))
}
