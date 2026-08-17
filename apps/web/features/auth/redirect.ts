// Where sign-in and sign-up send someone afterwards, and how a request to go
// somewhere specific survives the trip through the form.
//
// The destination arrives in the URL, which makes it attacker-controlled:
// anyone can send `/signin?redirect=https://evil.example`, and a router.push
// that trusts it hands the browser over with this site as the referrer, right
// after the person typed their password. That is an open redirect, and it is
// the reason this is a module with a comment rather than one inline string.
//
// The parameter's name lives here too, so `app/` never has to know it and a
// future rename is one edit.

/**
 * Where to land when nobody asked for anywhere in particular.
 *
 * This is the one place that answer is written down — `remove-example-domain`
 * rewrites this line when `/posts` stops existing.
 */
export const DEFAULT_DESTINATION = "/posts"

const REDIRECT_PARAM = "redirect"

/**
 * Absolute destinations resolve against this instead of the real origin, so
 * anything trying to leave the site lands on a different origin and can be
 * rejected by comparison rather than by a pattern list that has to keep up
 * with the ways a URL can be disguised.
 */
const SAME_ORIGIN = "http://redirect.invalid"

export type SearchParams = Record<string, string | string[] | undefined>

/**
 * The path to return to after signing in, or `undefined` when the request is
 * absent or not a same-origin path. Callers fall back to
 * {@link DEFAULT_DESTINATION}.
 */
export function sanitizeReturnTo(params: SearchParams): string | undefined {
  const raw = params[REDIRECT_PARAM]

  // A repeated parameter arrives as an array. Refuse rather than pick one: no
  // honest link sends two destinations, so the second is someone probing.
  if (typeof raw !== "string" || raw.length === 0) return undefined

  let url: URL
  try {
    url = new URL(raw, SAME_ORIGIN)
  } catch {
    return undefined
  }

  // One check covers every way out of the site: "https://evil.example" and
  // the scheme-relative "//evil.example" both parse to their own origin;
  // "/\evil.example" does too, because the URL parser folds the backslash
  // into a second slash exactly as a browser would; and "javascript:…" has no
  // origin at all, so it fails this the same way.
  if (url.origin !== SAME_ORIGIN) return undefined

  // Rebuilt from the parsed parts rather than returned as typed, so what gets
  // pushed is the normalised path and nothing else that rode along.
  return url.pathname + url.search + url.hash
}

/**
 * Link to an auth page and come back to `returnTo` afterwards. Anything
 * outside this feature links through here, so the parameter's name stays an
 * implementation detail.
 */
export function authPath(
  page: "/signin" | "/signup",
  returnTo?: string
): string {
  if (!returnTo) return page
  return `${page}?${REDIRECT_PARAM}=${encodeURIComponent(returnTo)}`
}
