// Errors declared in a contract are part of the API: the client knows their
// code and the shape of their data, and the UI can say something useful about
// them. Anything a handler throws that is *not* declared here becomes
// INTERNAL_SERVER_ERROR, is logged, and the user sees "something went wrong".
//
// The test for whether an error belongs in a contract is not how bad it is —
// it is whether the caller can do anything about it. A missing row is expected
// and actionable. A dropped database connection is neither.
//
// Spread these into a procedure's `.errors()` alongside its own codes:
//
//   oc.errors({ ...commonErrors, QUOTA_EXCEEDED: { data: ... } })

export const commonErrors = {
  /** No session, or the session expired. The client should send the user to log in. */
  UNAUTHORIZED: {},

  /** Authenticated, but not allowed to touch this particular row. */
  FORBIDDEN: {},

  /**
   * No row with that id — or one exists and belongs to somebody else.
   *
   * The two are deliberately indistinguishable. Answering FORBIDDEN for rows
   * that exist and NOT_FOUND for rows that do not turns the endpoint into a
   * way of discovering which ids are real.
   */
  NOT_FOUND: {},
}
