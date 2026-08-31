import { afterEach, describe, expect, it, vi } from "vitest"

import { parseFeatures } from "."

const KNOWN = ["alpha", "beta"] as const

afterEach(() => {
  vi.restoreAllMocks()
})

describe("parseFeatures", () => {
  it("turns nothing on when the variable is unset", () => {
    expect(parseFeatures(undefined, KNOWN).isOn("alpha")).toBe(false)
  })

  // The state every deployment starts in, and the one production stays in.
  it("turns nothing on when the variable is empty", () => {
    expect(parseFeatures("", KNOWN).isOn("alpha")).toBe(false)
  })

  it("turns on the names it is given, and only those", () => {
    const features = parseFeatures("alpha", KNOWN)

    expect(features.isOn("alpha")).toBe(true)
    expect(features.isOn("beta")).toBe(false)
  })

  it("reads a list", () => {
    const features = parseFeatures("alpha,beta", KNOWN)

    expect(features.isOn("alpha")).toBe(true)
    expect(features.isOn("beta")).toBe(true)
  })

  // A value typed into a settings page rather than a file, so it arrives with
  // whatever spacing the person used, and a trailing comma is normal.
  it("survives spacing and empty entries", () => {
    const features = parseFeatures(" alpha , , beta ,", KNOWN)

    expect(features.isOn("alpha")).toBe(true)
    expect(features.isOn("beta")).toBe(true)
  })

  it("warns about a name no flag answers to", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    parseFeatures("alphb", KNOWN)

    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0]?.[0]).toContain("alphb")
  })

  // The reason it warns rather than throws: a name left behind in a
  // deployment's environment after the flag was deleted must not be able to
  // stop the process from starting.
  it("keeps going after one, and still reads the rest", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const features = parseFeatures("alphb,beta", KNOWN)

    expect(features.isOn("beta")).toBe(true)
    expect(warn).toHaveBeenCalledOnce()
  })

  it("says nothing when every name is known", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    parseFeatures("alpha,beta", KNOWN)

    expect(warn).not.toHaveBeenCalled()
  })
})
