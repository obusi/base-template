// Next.js runs this once when the server starts, before the first request.
// It is the only hook that fires early enough to install the in-process oRPC
// client, which `lib/orpc.ts` then picks up.

export async function register() {
  await import("@/lib/orpc.server")
}
