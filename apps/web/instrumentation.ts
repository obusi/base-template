// Next.js runs this once when the server starts, before the first request.
// It is the only hook that fires early enough to install the in-process oRPC
// client, which `lib/orpc.ts` then picks up.

export async function register() {
  await import("@/lib/orpc.server")

  // Development only, and imported dynamically so the seed and its two
  // accounts are not in the production bundle at all. A preview deployment
  // builds with NODE_ENV=production like any other, which is what keeps a
  // known password off a public URL.
  if (process.env.NODE_ENV === "development") {
    const { seedDevUsers } = await import("@packages/api/connection/live")
    await seedDevUsers()
  }
}
