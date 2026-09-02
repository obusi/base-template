import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { inspect, inspectFolder, report } from "./safety"

/** Every case below is SQL drizzle-kit actually emits, not SQL invented to
 *  match the pattern. A check tested only against its own regexes proves the
 *  regexes exist. */
const rules = (sql: string) => inspect("test", sql).map(({ rule }) => rule)

describe("inspect", () => {
  describe("flags what a rollback cannot survive", () => {
    it.for<[string, string]>([
      ["DROP COLUMN", `ALTER TABLE "post" DROP COLUMN "content";`],
      ["DROP TABLE", `DROP TABLE "post" CASCADE;`],
      ["RENAME", `ALTER TABLE "post" RENAME COLUMN "content" TO "body";`],
      ["RENAME", `ALTER TABLE "post" RENAME TO "article";`],
      [
        "SET NOT NULL",
        `ALTER TABLE "post" ALTER COLUMN "excerpt" SET NOT NULL;`,
      ],
      [
        "ALTER COLUMN … TYPE",
        `ALTER TABLE "post" ALTER COLUMN "title" SET DATA TYPE varchar(200);`,
      ],
      [
        "DROP DEFAULT",
        `ALTER TABLE "post" ALTER COLUMN "view_count" DROP DEFAULT;`,
      ],
      [
        "ADD CONSTRAINT",
        `ALTER TABLE "post" ADD CONSTRAINT "post_title_unique" UNIQUE("title");`,
      ],
      [
        "ADD COLUMN … NOT NULL",
        `ALTER TABLE "post" ADD COLUMN "nickname" text NOT NULL;`,
      ],
    ])("%s", ([rule, sql]) => {
      expect(rules(sql)).toEqual([rule])
    })
  })

  describe("passes what the previous release cannot notice", () => {
    it.for<[string, string]>([
      ["a nullable column", `ALTER TABLE "post" ADD COLUMN "excerpt" text;`],
      [
        "a column with a default",
        `ALTER TABLE "post" ADD COLUMN "views" integer DEFAULT 0 NOT NULL;`,
      ],
      ["a new table", `CREATE TABLE "comment" ("id" uuid PRIMARY KEY);`],
      ["an index", `CREATE INDEX "post_title_idx" ON "post" ("title");`],
      ["dropping an index", `DROP INDEX "post_title_idx";`],
      [
        "dropping a constraint",
        `ALTER TABLE "post" DROP CONSTRAINT "post_title_unique";`,
      ],
      ["a backfill", `UPDATE "post" SET "body" = "content";`],
    ])("%s", ([, sql]) => {
      expect(rules(sql)).toEqual([])
    })
  })

  // `ADD COLUMN ... NOT NULL DEFAULT` is the case worth stating outright: it
  // contains the words `NOT NULL` and is safe, because the default is what
  // fills the rows that already exist. `SET NOT NULL` on an existing column is
  // the dangerous one, and the two are only a clause apart.
  it("does not confuse a defaulted NOT NULL column with SET NOT NULL", () => {
    expect(
      rules(`ALTER TABLE "post" ADD COLUMN "views" integer DEFAULT 0 NOT NULL;`)
    ).toEqual([])
  })

  // Two columns in one statement, only one of them defaulted. The comma in the
  // pattern is what keeps the first column's DEFAULT from excusing the second.
  it("reads each added column separately", () => {
    expect(
      rules(
        `ALTER TABLE "post" ADD COLUMN "views" integer DEFAULT 0 NOT NULL, ADD COLUMN "nickname" text NOT NULL;`
      )
    ).toEqual(["ADD COLUMN … NOT NULL"])
  })

  it("exempts a constraint on a table the same migration creates", () => {
    // What drizzle-kit writes for every new table with a foreign key. Without
    // the exemption this check fails on the migration that introduces it, and
    // a check that cries wolf on the ordinary case is a check that gets turned
    // off.
    const sql = `CREATE TABLE "comment" (
\t"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
\t"post_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "post"("id") ON DELETE CASCADE;`

    expect(rules(sql)).toEqual([])
  })

  it("still flags a constraint on a table that already existed", () => {
    const sql = `CREATE TABLE "comment" ("id" uuid PRIMARY KEY);
--> statement-breakpoint
ALTER TABLE "post" ADD CONSTRAINT "post_title_unique" UNIQUE("title");`

    expect(rules(sql)).toEqual(["ADD CONSTRAINT"])
  })

  describe("reads SQL, not prose", () => {
    it("ignores a line comment", () => {
      expect(
        rules(`-- this replaces the DROP COLUMN we decided against\n`)
      ).toEqual([])
    })

    it("ignores a block comment", () => {
      expect(rules(`/* DROP TABLE "post"; */`)).toEqual([])
    })

    it("ignores a string literal", () => {
      expect(
        rules(`UPDATE "post" SET "note" = 'drop column content' WHERE TRUE;`)
      ).toEqual([])
    })

    it("does not match a table whose name contains a keyword", () => {
      expect(
        rules(`CREATE TABLE "dropbox_sync" ("id" uuid PRIMARY KEY);`)
      ).toEqual([])
    })

    it("does not match a column named rename_at", () => {
      expect(
        rules(`ALTER TABLE "post" ADD COLUMN "rename_at" timestamp;`)
      ).toEqual([])
    })
  })

  it("points at the line in the original file", () => {
    const sql = `CREATE TABLE "comment" ("id" uuid PRIMARY KEY);
--> statement-breakpoint
ALTER TABLE "post" DROP COLUMN "content";`

    expect(inspect("test", sql)).toEqual([
      {
        migration: "test",
        rule: "DROP COLUMN",
        line: 3,
        statement: `DROP COLUMN "content";`,
      },
    ])
  })

  it("reports every violation in a file, not just the first", () => {
    const sql = `ALTER TABLE "post" DROP COLUMN "content";
--> statement-breakpoint
ALTER TABLE "post" DROP COLUMN "excerpt";`

    expect(rules(sql)).toEqual(["DROP COLUMN", "DROP COLUMN"])
  })
})

describe("inspectFolder", () => {
  /** A `drizzle/`-shaped folder holding one migration. */
  function folderWith(migration: string, sql: string): string {
    const dir = mkdtempSync(join(tmpdir(), "migration-safety-"))

    mkdirSync(join(dir, migration))
    writeFileSync(join(dir, migration, "migration.sql"), sql)

    return dir
  }

  const destructive = `ALTER TABLE "post" DROP COLUMN "content";`

  it("flags a migration whose name does not declare the intent", () => {
    const dir = folderWith("20260902000000_hot_proteus", destructive)

    expect(inspectFolder(dir).map(({ rule }) => rule)).toEqual(["DROP COLUMN"])
  })

  it("skips a migration whose name does", () => {
    const dir = folderWith(
      "20260902000000_destructive_drop_content",
      destructive
    )

    expect(inspectFolder(dir)).toEqual([])
  })
})

describe("report", () => {
  it("names the file, the line, and the way out", () => {
    const message = report(
      inspect("20260902000000_hot_proteus", destructiveSql)
    )

    expect(message).toContain("20260902000000_hot_proteus/migration.sql:1")
    expect(message).toContain("pnpm db:generate --name=destructive_")
  })
})

const destructiveSql = `ALTER TABLE "post" DROP COLUMN "content";`

// The check itself, over this repository's own migrations. Everything above
// tests the detector; this is the assertion that fails a pull request.
//
// It lives beside the unit tests rather than in a script of its own for the
// reason `rls-guard.test.ts` does: `pnpm verify` already runs the suite, in CI
// and as the session's Stop hook, so a rule enforced as a test needs no new
// command and no new CI step to be a gate.
describe("packages/db/drizzle", () => {
  it("holds no migration a rollback cannot survive", () => {
    const violations = inspectFolder(
      join(import.meta.dirname, "..", "..", "drizzle")
    )

    expect(violations, report(violations)).toEqual([])
  })
})
