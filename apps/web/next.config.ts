import type { NextConfig } from "next"

// Imported for its side effect: validating the environment. Without this line
// `env.ts` is only checked when some module happens to read it, which means a
// missing DATABASE_URL surfaces on a request rather than at build time.
import "./env"

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source rather than a build step, so
  // Next has to compile them itself.
  transpilePackages: [
    "@packages/api",
    "@packages/auth",
    "@packages/shared",
    "@packages/db",
    "@packages/ui",
  ],

  // Three headers on everything this app serves. All three are true of any
  // project built on this template, which is the test for whether a default
  // belongs here at all — none of them has a value a project would want to
  // change rather than remove.
  //
  // They cover **only what Next serves**. A report's attachment is fetched
  // from Supabase's storage domain through a signed URL, so nothing set here
  // reaches it; `docs/provisioning.md` covers that file's own headers, and
  // why an HTML file uploaded as an image is junk rather than a hole.
  //
  // A Content-Security-Policy is deliberately **not** here. It has to name the
  // third parties a project actually loads, which a template cannot know: a
  // permissive default would read as protection while providing none, and a
  // strict one turns the first analytics snippet into a blank page and gets
  // deleted wholesale by whoever cannot debug it. `docs/provisioning.md` has
  // it as a step to take before launch instead.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Nothing here is meant to be embedded, and a page that can be
          // embedded invisibly can be clicked through: an attacker's page
          // overlays a harmless button on a real one and a signed-in visitor
          // presses it without seeing what they pressed.
          { key: "X-Frame-Options", value: "DENY" },

          // Take the Content-Type at its word. Without this a browser may
          // decide a response is really a document and parse it as one —
          // which matters most for the responses this app generates rather
          // than serves from disk, /api/spec and /rpc among them.
          { key: "X-Content-Type-Options", value: "nosniff" },

          // Browsers already default to strict-origin-when-cross-origin, which
          // sends the origin and drops the path. This goes one step further and
          // sends nothing at all off-site, because the paths here carry ids —
          // /admin/reports/<uuid> tells an outbound link both that the route
          // exists and which row was open.
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ]
  },
}

export default nextConfig
