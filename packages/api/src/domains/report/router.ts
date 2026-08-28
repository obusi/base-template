// Translates between oRPC and ./service — see packages-api.md.

import { requireAdminRole, requireAuth } from "../../middleware/auth"
import { os } from "../../shared/builder"
import * as service from "./service"

export const createUploadUrls = os.report.createUploadUrls
  .use(requireAuth)
  .handler(async ({ context, input, errors }) => {
    // A deployment with no bucket configured. Declared in the contract so the
    // form can hide its file picker instead of showing one that fails.
    if (!context.reportStorage) {
      throw errors.ATTACHMENTS_UNAVAILABLE()
    }

    return {
      targets: await service.createUploadTargets(
        context.reportStorage,
        context.user.id,
        input.files
      ),
    }
  })

export const create = os.report.create
  .use(requireAuth)
  .handler(({ context, input, errors }) => {
    // The paths came from `createUploadUrls`, but they made a round trip
    // through the browser, so they are input like any other. Every object this
    // caller was given lives under its own prefix; anything else is a caller
    // naming somebody else's file.
    const prefix = service.attachmentPrefix(context.user.id)

    if (input.attachments.some(({ path }) => !path.startsWith(prefix))) {
      throw errors.FORBIDDEN()
    }

    return service.createReport(context.db, context.user.id, {
      ...input,

      // Read from the request rather than accepted as input. The caller can
      // put anything in a form field; this is the one copy of the value it
      // does not control, and the whole point of the column is to be true.
      userAgent: context.headers.get("user-agent") ?? undefined,
    })
  })

// `requireAdminRole` already carries `requireAuth`, so an anonymous caller is
// refused with UNAUTHORIZED and a signed-in non-admin with FORBIDDEN.
export const list = os.report.list
  .use(requireAdminRole)
  .handler(({ context, input }) =>
    service.listReports(context.db, context.reportStorage, input)
  )

export const reportRouter = { createUploadUrls, create, list }
