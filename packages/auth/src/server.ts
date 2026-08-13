// The server entry point. Importing it from a Client Component is a build
// error, not a runtime surprise — this marker is the only thing standing
// between the auth secret and the browser bundle.
import "server-only"

// Relative, because `config.ts` is deliberately absent from this package's
// `exports` map — that is what keeps anything outside from reaching around
// this file. A path alias would need it exported to resolve.
export { auth, createAuth, type Auth, type Session } from "./config"
