// Every table in the project lives in its own domain folder and is
// re-exported here, so Drizzle Kit sees one schema and foreign keys can point
// across domains.
//
// Every table must enable row level security. `rls-guard.test.ts` next to this
// file fails the build if one does not — see docs/architecture.md section 6.
export * from "./auth/schema"
export * from "./post/schema"
