// Which page a report is about, and how that survives the trip to the form.
//
// `document.referrer` is the obvious source and the wrong one: it is set by a
// full document load, and every in-app navigation — which is how someone
// actually reaches /report — leaves it untouched. So the link carries the
// path instead.
//
// That makes the value attacker-controlled, the same way
// features/auth/redirect.ts describes: anyone can send
// `/report?from=https://evil.example`. Nothing navigates to this one, but it
// is stored and later rendered to an admin who may well click it, so it is
// checked the same way and by the same trick.

/**
 * Absolute values resolve against this instead of the real origin, so anything
 * pointing off-site lands on a different origin and is rejected by comparison
 * rather than by a pattern list that has to keep up with the ways a URL can be
 * disguised.
 */
const SAME_ORIGIN = "http://report.invalid"

const FROM_PARAM = "from"

/**
 * Where the "Report a problem" link points from the given page.
 *
 * The parameter's name lives here, so nothing else has to know it.
 */
export function reportPath(pathname: string): string {
  // Already here: there is no earlier page to name, and `from=/report` would
  // tell an admin nothing.
  if (pathname === "/report") return "/report"

  return `/report?${FROM_PARAM}=${encodeURIComponent(pathname)}`
}

/** Read the parameter back out. Kept beside the writer so the two agree. */
export function readFrom(params: URLSearchParams): string | null {
  return params.get(FROM_PARAM)
}

/**
 * The absolute URL to store, or `undefined` when there is nothing worth
 * storing. `origin` is the real one — `window.location.origin` in the browser.
 */
export function reportedPageUrl(
  from: string | null,
  origin: string
): string | undefined {
  if (!from) return undefined

  let url: URL
  try {
    url = new URL(from, SAME_ORIGIN)
  } catch {
    return undefined
  }

  // One check covers every way out of the site: "https://evil.example" and the
  // scheme-relative "//evil.example" both parse to their own origin,
  // "/\evil.example" does too because the parser folds the backslash into a
  // second slash, and "javascript:…" has no origin at all.
  if (url.origin !== SAME_ORIGIN) return undefined

  // Rebuilt from the parsed parts rather than concatenated as given, so what
  // is stored is the normalised path and nothing that rode along with it.
  return `${origin}${url.pathname}${url.search}`
}
