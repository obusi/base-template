// `pnpm --filter @packages/db db:check` — run this against every project's own
// database, once, after the first migration.
//
// RLS deny-all works because two different things are true at the same time:
// the application's connection is exempt from row security, and no other role
// is. Both depend on how the Supabase project was provisioned, so neither can
// be inherited from this template — they have to be measured per project.
//
// Getting it wrong is quiet in both directions. If the app is not exempt, every
// query returns nothing and no error is raised. If another role is exempt, a
// leaked key reads the whole database and nothing looks wrong at all.

import postgres from "postgres"

/** Roles a leaked Supabase key would authenticate as. */
const PUBLIC_ROLES = ["anon", "authenticated"]

/** Thrown to roll back the read-only probe. Declared here because classes,
 *  unlike functions, are not hoisted past the code that catches them. */
class RollbackAfterReading extends Error {}

/** Both codes mean the same thing to this script: the role could not reach the
 *  table. They are not equally good news.
 *
 *  42501 insufficient_privilege is the weaker one — the role resolved the name
 *  and was refused, so it knows the table is there.
 *
 *  42P01 undefined_table is the stronger one. Resolving an unqualified name
 *  walks `search_path` and silently skips every schema the role lacks USAGE
 *  on, so a table it cannot reach reads as nonexistent rather than forbidden.
 *  A Supabase project created with the Data API off answers this way, and that
 *  is the normal case here: `anon` and `authenticated` exist only to serve
 *  PostgREST, and are granted nothing once it is switched off.
 *
 *  Neither can be a genuine missing table. Both are only ever caught after
 *  `set local role`, on a relation this same connection read successfully one
 *  statement earlier. */
function isUnreachable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "42501" || error.code === "42P01")
  )
}

type Connection = {
  role: string
  is_superuser: boolean
  bypasses_rls: boolean
}

type Table = {
  name: string
  owner: string
  rls: boolean
  policies: number
}

const problems: string[] = []
const notes: string[] = []

const url = process.env.DATABASE_URL

if (!url) {
  console.error("DATABASE_URL is not set. Create packages/db/.env first.")
  process.exit(1)
}

const sql = postgres(url, { prepare: false, max: 1 })

const [connection] = await sql<Connection[]>`
  select current_user as role,
         usesuper as is_superuser,
         usebypassrls as bypasses_rls
  from pg_user
  where usename = current_user
`

if (!connection) {
  console.error("Could not identify the connecting role.")
  process.exit(1)
}

const tables = await sql<Table[]>`
  select c.relname as name,
         pg_get_userbyid(c.relowner) as owner,
         c.relrowsecurity as rls,
         (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
  order by c.relname
`

console.log(
  `\nconnected as ${connection.role}` +
    `  superuser=${connection.is_superuser}` +
    `  bypassrls=${connection.bypasses_rls}\n`
)

if (tables.length === 0) {
  console.error("No tables in the public schema. Run db:migrate first.")
  process.exit(1)
}

// A superuser bypasses row security unconditionally, which means the rest of
// this script would pass no matter how the tables were configured.
if (connection.is_superuser) {
  notes.push(
    "The connecting role is a superuser, so it bypasses RLS whatever the " +
      "tables say. Deploy with a non-superuser role to make this check mean " +
      "something."
  )
}

for (const table of tables) {
  const exempt = connection.bypasses_rls || table.owner === connection.role

  if (!table.rls) {
    problems.push(
      `${table.name}: row level security is off — any role with a SELECT ` +
        `grant reads every row.`
    )
  }

  if (!exempt) {
    problems.push(
      `${table.name}: owned by ${table.owner}, and the app's role neither ` +
        `owns it nor has BYPASSRLS — queries will silently return nothing.`
    )
  }

  console.log(
    `${table.name.padEnd(16)} owner=${table.owner.padEnd(12)}` +
      ` rls=${String(table.rls).padEnd(6)} policies=${table.policies}` +
      `${exempt ? "" : "   <- app cannot read this"}`
  )
}

// Everything above reads catalogue flags. This proves the mechanism they
// describe actually bites on this database: a table with RLS on and no
// policies, holding a row, must be invisible to a public role.
//
// It uses a table of its own because the real ones are usually empty in a
// project new enough to be running this — and "0 rows" from an empty table is
// indistinguishable from "0 rows because RLS worked".
//
// The ALTER below looks redundant on a Supabase project created with
// "Enable automatic RLS", where an event trigger already turns it on for every
// new table. It is not redundant anywhere else, and this script should not
// depend on a setting it cannot see.
//
// That trigger is also why this script cannot stand in for
// `rls-guard.test.ts`: on Supabase a table that forgot `withRLS()` gets
// protected anyway, so only the PGlite test can catch the omission in the
// schema. This one checks the deployment; that one checks the code.
console.log("")

for (const role of PUBLIC_ROLES) {
  const [exists] = await sql`select 1 from pg_roles where rolname = ${role}`

  if (!exists) continue

  let ownerSees: number | null = null
  let roleSees: number | null = null
  let unreachable = false

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(`create table _rls_probe (id int)`)
      await tx.unsafe(`alter table _rls_probe enable row level security`)
      await tx.unsafe(`insert into _rls_probe values (1)`)

      const [owner] = await tx<{ n: number }[]>`
        select count(*)::int as n from _rls_probe
      `
      ownerSees = owner?.n ?? 0

      await tx.unsafe(`set local role ${role}`)

      const [other] = await tx<{ n: number }[]>`
        select count(*)::int as n from _rls_probe
      `
      roleSees = other?.n ?? 0

      // The table, the row and the role change all disappear with this.
      throw new RollbackAfterReading()
    })
  } catch (error) {
    if (error instanceof RollbackAfterReading) {
      // expected
    } else if (isUnreachable(error)) {
      unreachable = true
    } else {
      throw error
    }
  }

  if (unreachable) {
    console.log(`probe: ${role} cannot reach a protected table`)
    continue
  }

  if (ownerSees !== 1) {
    problems.push(
      `probe: the app saw ${ownerSees} of 1 row it had just inserted, so this ` +
        `check cannot tell whether ${role} is being denied or the read is ` +
        `broken for everyone.`
    )
    continue
  }

  if (roleSees === 0) {
    console.log(`probe: ${role} saw 0 of 1 row in a protected table`)
  } else {
    problems.push(
      `probe: ${role} read ${roleSees} of 1 row from a table with RLS on and ` +
        `no policies. Deny-all does not work on this database.`
    )
  }
}

// And now the same question against the real tables.
console.log("")

for (const role of PUBLIC_ROLES) {
  const [exists] = await sql`select 1 from pg_roles where rolname = ${role}`

  if (!exists) {
    console.log(`${role.padEnd(16)} role does not exist — nothing to check`)
    continue
  }

  for (const table of tables) {
    let visible: number | null = null
    let unreachable = false

    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(`set local role ${role}`)
        const [row] = await tx<{ n: number }[]>`
          select count(*)::int as n from ${tx(table.name)}
        `
        visible = row?.n ?? 0
        // Read-only, but rolling back keeps `set local role` from outliving
        // this block under any pooling arrangement.
        throw new RollbackAfterReading()
      })
    } catch (error) {
      if (error instanceof RollbackAfterReading) {
        // expected
      } else if (isUnreachable(error)) {
        unreachable = true
      } else {
        throw error
      }
    }

    if (unreachable) {
      console.log(`${role.padEnd(16)} ${table.name.padEnd(16)} cannot reach`)
      continue
    }

    if (visible === null) {
      problems.push(`${role} on ${table.name}: could not complete the read.`)
      continue
    }

    if (visible > 0) {
      problems.push(
        `${role} can read ${visible} row(s) from ${table.name}. A leaked key ` +
          `reads this table.`
      )
      console.log(`${role.padEnd(16)} ${table.name.padEnd(16)} SEES ${visible}`)
      continue
    }

    // Zero rows proves nothing on an empty table: an unprotected empty table
    // looks exactly like a protected one.
    const [own] = await sql<{ n: number }[]>`
      select count(*)::int as n from ${sql(table.name)}
    `
    const total = own?.n ?? 0

    if (total === 0) {
      console.log(
        `${role.padEnd(16)} ${table.name.padEnd(16)} 0 rows (table is empty — inconclusive)`
      )
    } else {
      console.log(
        `${role.padEnd(16)} ${table.name.padEnd(16)} 0 of ${total} rows`
      )
    }
  }
}

await sql.end()

for (const note of notes) {
  console.log(`\nnote: ${note}`)
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`)
  for (const problem of problems) {
    console.error(`  - ${problem}`)
  }
  process.exit(1)
}

console.log("\nRLS deny-all is intact for this database.")
