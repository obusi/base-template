// Translates between oRPC and ./service — see packages-api.md.

import { requireAdminRole, requireAuth } from "../../middleware/auth"
import { requireFeature } from "../../middleware/features"
import { os } from "../../shared/builder"
import * as reportService from "./service"

export const createUploadUrls = os.report.createUploadUrls
  .use(requireAuth)
  .handler(async ({ context, input, errors }) => {
    // A deployment with no bucket configured. Declared in the contract so the
    // form can hide its file picker instead of showing one that fails.
    if (!context.reportStorage) {
      throw errors.ATTACHMENTS_UNAVAILABLE()
    }

    return {
      targets: await reportService.createUploadTargets(
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
    const prefix = reportService.attachmentPrefix(context.user.id)

    if (input.attachments.some(({ path }) => !path.startsWith(prefix))) {
      throw errors.FORBIDDEN()
    }

    return reportService.create(context.db, context.user.id, {
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
    reportService.list(context.db, context.reportStorage, input)
  )

// Behind a release toggle: the work is merged and the column has always been
// there, but nobody sees this until `report-status` is set.
//
// `requireFeature` goes **first**, ahead of the role check, and the order is
// the assertion. A flag decides whether the procedure exists in this
// deployment; a role decides who may call one that does. Guarding in the other
// order would answer FORBIDDEN to a signed-in non-admin while the flag is off,
// which tells them there is something here — exactly what NOT_FOUND is chosen
// to avoid.
export const updateStatus = os.report.updateStatus
  .use(requireFeature("report-status"))
  .use(requireAdminRole)
  .handler(async ({ context, input, errors }) => {
    const row = await reportService.updateStatus(
      context.db,
      input.id,
      input.status
    )

    // No row with that id. Nothing to leak here — an admin may touch every
    // report, so NOT_FOUND means what it says rather than standing in for
    // "not yours".
    if (!row) {
      throw errors.NOT_FOUND()
    }

    return row
  })

export const reportRouter = { createUploadUrls, create, list, updateStatus }
