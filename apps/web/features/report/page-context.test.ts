import { describe, expect, it } from "vitest"

import { readFrom, reportedPageUrl, reportPath } from "./page-context"

const ORIGIN = "https://app.example"

describe("reportPath", () => {
  it("carries the page the person was on", () => {
    expect(reportPath("/posts")).toBe("/report?from=%2Fposts")
  })

  it("carries nothing from the report page itself", () => {
    expect(reportPath("/report")).toBe("/report")
  })

  it("round-trips through the parameter it writes", () => {
    const query = reportPath("/posts/a b").split("?")[1] ?? ""

    expect(readFrom(new URLSearchParams(query))).toBe("/posts/a b")
  })
})

describe("reportedPageUrl", () => {
  it("resolves a path against the real origin", () => {
    expect(reportedPageUrl("/posts", ORIGIN)).toBe("https://app.example/posts")
  })

  it("keeps the query string", () => {
    expect(reportedPageUrl("/posts?page=2", ORIGIN)).toBe(
      "https://app.example/posts?page=2"
    )
  })

  it("is undefined when nothing was carried", () => {
    expect(reportedPageUrl(null, ORIGIN)).toBeUndefined()
    expect(reportedPageUrl("", ORIGIN)).toBeUndefined()
  })

  // Each of these reaches a different origin once parsed, which is the whole
  // reason the check is a comparison rather than a list of patterns.
  it.each([
    "https://evil.example/phish",
    "//evil.example/phish",
    "/\\evil.example/phish",
    "javascript:alert(1)",
  ])("refuses %s", (from) => {
    expect(reportedPageUrl(from, ORIGIN)).toBeUndefined()
  })
})
