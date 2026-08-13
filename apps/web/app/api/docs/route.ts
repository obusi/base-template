// Browsable API reference at /api/docs, rendered by Scalar from the document
// at /api/spec.
//
// It is served, not hidden behind a development check: the spec describes an
// API that is already reachable, so withholding the page would be obscurity
// rather than protection. If a project needs the endpoints themselves closed
// off, that belongs in the procedures.

import { ApiReference } from "@scalar/nextjs-api-reference"

export const GET = ApiReference({
  url: "/api/spec",
  pageTitle: "base-template API",
})
