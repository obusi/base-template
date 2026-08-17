// Sign-in, sign-up, sign-out, email verification, password reset, and anything
// a Better Auth plugin adds later — all of it lands here. None of it goes
// through oRPC: Better Auth ships its own typed client, and its Expo
// integration reaches these same endpoints. See docs/architecture.md S4.

import { toNextJsHandler } from "better-auth/next-js"

import { auth } from "@packages/auth/server"

export const { GET, POST } = toNextJsHandler(auth)
