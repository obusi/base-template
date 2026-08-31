// Feature flags, of exactly one kind: the release toggle. A flag here hides
// work that is merged but not finished, so that a branch never has to live
// longer than a day. It is on for as long as the work takes and then it is
// deleted — with the code path it was guarding, in the same commit.
//
// It is deliberately not the other kinds:
//
// - **A kill switch** turns off something already in front of users, which
//   means it has to change without a deploy. These come from the environment,
//   so changing one *is* a deploy. That is fine for work nobody has seen yet
//   and useless at two in the morning.
// - **A permission toggle** shows a feature to some people and not others,
//   which means knowing who is asking. Nothing here takes a user. That
//   question already has an answer in this repo — `role`.
//
// Both would be built on top of this rather than inside it: a later layer
// answers first and falls through to the environment, and no call site
// changes. Reaching for either is a signal that the need is different, not
// that this file should grow.

/**
 * Every flag that exists. Empty is the resting state — a flag is added the day
 * work starts behind it and removed the day that work ships.
 *
 * Spelling is checked against this list, so a flag that is on in one place and
 * off in another cannot be caused by a typo that nothing reports.
 */
export const FEATURES = [
  // Letting an admin change a report's status. The column has existed since the
  // table was created and nothing ever wrote it; `report.updateStatus` is the
  // procedure that does. Releasing means deleting this line, the `.use()` in
  // `packages/api`, the `isOn` branch in `apps/web`, and the value wherever it
  // is set.
  "report-status",
] as const

/** The name of a flag that exists. */
export type Feature = (typeof FEATURES)[number]

/** Answers whether a flag is on, without saying where the answer came from. */
export type FeatureSet<Name extends string = Feature> = {
  isOn: (feature: Name) => boolean
}

/**
 * Reads the comma-separated list an environment variable holds.
 *
 * Takes the string rather than reading `process.env` itself, for the same
 * reason nothing in this repo imports a database: a caller can hand it any
 * value, and this package stays runnable anywhere — including a bundler that
 * has no `process` at all.
 *
 * `known` is handed in rather than read from `FEATURES` directly so that a
 * test can exercise the parser with names of its own. In the running app both
 * call sites pass `FEATURES`.
 *
 * **An unknown name warns rather than throws.** The failure it catches —
 * `report-eidt` for `report-edit` — happens while someone is setting a value
 * and watching a terminal, where a warning is seen. Throwing would move the
 * cost to the wrong moment: a flag deleted from the code while its name is
 * still set in the deployment's environment would take the next deploy down,
 * long after anyone was looking.
 */
export function parseFeatures<const Name extends string>(
  value: string | undefined,
  known: readonly Name[]
): FeatureSet<Name> {
  const named = (value ?? "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)

  const unknown = named.filter((name) => !known.includes(name as Name))

  if (unknown.length > 0) {
    console.warn(
      `[features] ignoring ${unknown.length === 1 ? "a name" : "names"} no flag answers to: ${unknown.join(", ")}.\n` +
        `[features] flags that exist: ${known.length > 0 ? known.join(", ") : "(none)"}`
    )
  }

  const on = new Set(named)

  return { isOn: (feature) => on.has(feature) }
}
