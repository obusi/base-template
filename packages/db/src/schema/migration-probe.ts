// Throwaway. Exists to watch a schema change travel from a pull request to a
// preview database and then to production, and to be deleted once it has.

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const migrationProbe = pgTable.withRLS("migration_probe", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})
