// Every table in the project is defined under this folder and re-exported here,
// so Drizzle Kit sees one schema and foreign keys can point across domains.
//
// Every table must enable row level security. `rls-guard.test.ts` next to this
// file fails the build if one does not — see docs/architecture.md section 6.

// Relative, not `@packages/db/schema/auth`: drizzle-kit's module loader reads
// the `@packages/db/schema` path mapping as a prefix and tries to resolve
// `.../schema/index.ts/auth`. Siblings in this folder are imported relatively.
export * from "./auth"
