// The rule in `.claude/rules/packages-db.md`, made mechanical: a migration has
// to be one the release before it can still run against, because rolling back
// moves the code and leaves the database where it is.
//
// Reading generated SQL is the step that gets skipped. Nobody writes these
// files — `db:generate` does, from a schema diff — so a line removed from a
// table definition becomes a `DROP COLUMN` that nothing announces. This finds
// those statements before they reach `main`, and `safety.test.ts` is what runs
// it over `drizzle/`.
//
// A migration whose folder name says `destructive` is exempt. drizzle-kit names
// folders after a random pair of words unless `--name` is passed, so that word
// is there because somebody typed it — which is the whole of the intent. This
// is a guard against the accident, not against the decision.

import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

/** A statement that the previous release cannot survive, and where it is. */
export type Violation = {
  /** Migration folder name — what the reviewer sees in the diff. */
  migration: string
  /** 1-indexed, into the original file rather than the masked copy. */
  line: number
  /** The offending fragment, collapsed onto one line for the report. */
  statement: string
  /** Which of the seven rules matched. */
  rule: string
}

// The seven from the rules file. Each one either removes something the previous
// release still asks for, or narrows what the table accepts below what it still
// sends.
//
// Written as clauses rather than bare keywords on purpose: `\bRENAME\b` alone
// matches a column named `rename`, and `DROP` alone matches half of `dropbox`.
// Requiring the word that follows costs nothing and removes the entire class of
// false positive that gets a check like this switched off.
const RULES: ReadonlyArray<{ rule: string; pattern: RegExp }> = [
  { rule: "DROP COLUMN", pattern: /\bDROP\s+COLUMN\b/i },
  { rule: "DROP TABLE", pattern: /\bDROP\s+TABLE\b/i },
  { rule: "RENAME", pattern: /\bRENAME\s+(?:COLUMN|CONSTRAINT|TO)\b/i },
  { rule: "SET NOT NULL", pattern: /\bSET\s+NOT\s+NULL\b/i },
  { rule: "ALTER COLUMN … TYPE", pattern: /\bALTER\s+COLUMN\b[^;]*?\bTYPE\b/i },
  { rule: "DROP DEFAULT", pattern: /\bDROP\s+DEFAULT\b/i },
  { rule: "ADD CONSTRAINT", pattern: /\bADD\s+CONSTRAINT\b/i },
  // The one drizzle-kit writes when a column gains `.notNull()` without a
  // default, and the only rule here that has to read a clause rather than
  // match one: `ADD COLUMN "x" text NOT NULL` fails against every row that
  // already exists, while `ADD COLUMN "x" integer DEFAULT 0 NOT NULL` is
  // ordinary and safe, because the default is what fills those rows. The
  // lookahead is what separates them, and the comma keeps one column's clause
  // from reaching into the next.
  {
    rule: "ADD COLUMN … NOT NULL",
    pattern: /\bADD\s+COLUMN\b(?:(?!\bDEFAULT\b)[^,;])*\bNOT\s+NULL\b/i,
  },
]

// `DROP INDEX` and `DROP CONSTRAINT` are deliberately absent. They loosen the
// schema, and whatever the previous release could write it can still write.

/** Blanks out comments and string literals, preserving length and newlines so
 *  that a match index still points at the right line of the original.
 *
 *  Without this, a backfill that happens to read
 *  `UPDATE "post" SET "note" = 'drop column'` reports itself, and the comment
 *  explaining why a drop was safe becomes the thing that fails the check. */
function mask(sql: string): string {
  const blank = (text: string) => text.replace(/[^\n]/g, " ")

  return sql
    .replace(/--[^\n]*/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/'(?:[^']|'')*'/g, blank)
}

/** Tables this migration creates. A constraint added to one of them cannot
 *  break the previous release, which has never heard of the table — and
 *  without this exemption every `CREATE TABLE` migration drizzle-kit writes
 *  fails on its own foreign keys, since it emits those as `ADD CONSTRAINT`. */
function tablesCreatedHere(masked: string): Set<string> {
  const created = new Set<string>()
  const pattern = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([^"\s(]+)"?/gi

  for (const match of masked.matchAll(pattern)) {
    const name = match[1]

    if (name) created.add(name)
  }

  return created
}

/** The table a statement acts on, if it names one. */
function targetTable(statement: string): string | undefined {
  const match =
    /\b(?:ALTER|DROP)\s+TABLE\s+(?:IF\s+EXISTS\s+)?"?([^"\s(]+)"?/i.exec(
      statement
    )

  return match?.[1]
}

/** Everything in one migration's SQL that the previous release cannot survive.
 *  Pure: `migration` is only carried through so the caller can report it. */
export function inspect(migration: string, sql: string): Violation[] {
  const masked = mask(sql)
  const created = tablesCreatedHere(masked)
  const violations: Violation[] = []

  // Split on the statement terminator rather than drizzle-kit's
  // `--> statement-breakpoint`, which is a comment and has already been masked
  // away — and which a hand-written `--custom` migration has no reason to emit.
  let offset = 0

  for (const statement of masked.split(";")) {
    const target = targetTable(statement)

    if (!target || !created.has(target)) {
      for (const { rule, pattern } of RULES) {
        const match = pattern.exec(statement)

        if (!match) continue

        const index = offset + match.index

        violations.push({
          migration,
          rule,
          line: sql.slice(0, index).split("\n").length,
          // From the original, not the mask, or the report is a row of spaces.
          statement: sql
            .slice(index, index + 80)
            .split("\n")
            .join(" ")
            .trim(),
        })
      }
    }

    offset += statement.length + 1
  }

  return violations
}

/** Every violation across a `drizzle/` folder, skipping the ones whose name
 *  declares the intent. */
export function inspectFolder(drizzleDir: string): Violation[] {
  const migrations = readdirSync(drizzleDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.toLowerCase().includes("destructive"))
    .sort()

  return migrations.flatMap((migration) => {
    const sql = readFileSync(
      join(drizzleDir, migration, "migration.sql"),
      "utf8"
    )

    return inspect(migration, sql)
  })
}

/** The failure message. Written here rather than left to a matcher's diff
 *  because the useful part is the way out, not the shape of the objects. */
export function report(violations: Violation[]): string {
  const lines = violations.map(
    ({ migration, line, statement, rule }) =>
      `  ${migration}/migration.sql:${line}\n` +
      `    ${statement}\n` +
      `    ${rule} — the release before this one cannot run against it`
  )

  return [
    `${violations.length} statement(s) a rollback cannot survive:`,
    "",
    ...lines,
    "",
    "If the code stopped using this a release ago, regenerate the migration as",
    "  pnpm db:generate --name=destructive_<what>",
    "",
    "If it did not, split the work: stop reading it in this pull request, and",
    "drop it in a later one. .claude/rules/packages-db.md has the rounds.",
  ].join("\n")
}
