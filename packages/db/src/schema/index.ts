// Every table in the project lives in its own domain file and is re-exported
// here, so Drizzle Kit sees one schema and foreign keys can point across
// domains.
//
// Siblings are imported relatively (`./auth`, never the `@packages/db/schema`
// alias) — drizzle-kit's loader misreads that alias as a string prefix and
// fails with "Cannot find module '.../schema/index.ts/auth'". See
// docs/architecture.md section 11 (C15).
//
// Every table must enable row level security. `rls-guard.test.ts` next to this
// file fails the build if one does not — see docs/architecture.md section 6.
export * from "./auth"
export * from "./post"
