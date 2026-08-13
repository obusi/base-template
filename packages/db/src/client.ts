import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import { env } from "@packages/db/env"

// Supabase's transaction-mode pooler does not support prepared statements, so
// `prepare: false` is required. Leaving it out produces intermittent runtime
// errors that are hard to attribute.
const client = postgres(env.DATABASE_URL, { prepare: false })

export const db = drizzle({ client })

export type Database = typeof db
