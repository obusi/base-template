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
    "@packages/contract",
    "@packages/db",
    "@packages/ui",
  ],
}

export default nextConfig
