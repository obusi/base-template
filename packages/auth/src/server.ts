// The server entry point. Importing it from a Client Component is a build
// error, not a runtime surprise — this marker is the only thing standing
// between the auth secret and the browser bundle.
import "server-only"

export { auth, type Auth, type Session } from "@packages/auth/config"
