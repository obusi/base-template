// The open-redirect guard is the one piece of this app worth a unit test: it
// is pure, and getting it wrong hands a signed-in browser to another site.
//
// Every case below is a real shape an attacker sends, not an invented one.

import { describe, expect, it } from "vitest"

import { authPath, DEFAULT_DESTINATION, sanitizeReturnTo } from "./redirect"

describe("sanitizeReturnTo", () => {
  describe("accepts same-origin paths", () => {
    // This block is the companion the repo's testing rules ask for: a guard
    // that rejected everything would pass every case in the block below while
    // being useless, and these are what go red if that happens.
    it("returns a plain path unchanged", () => {
      expect(sanitizeReturnTo({ redirect: "/posts" })).toBe("/posts")
    })

    it("keeps the query string and hash", () => {
      expect(sanitizeReturnTo({ redirect: "/posts?page=2#latest" })).toBe(
        "/posts?page=2#latest"
      )
    })

    it("normalises a path that resolves within the site", () => {
      expect(sanitizeReturnTo({ redirect: "/a/../posts" })).toBe("/posts")
    })
  })

  describe("rejects anything that would leave the site", () => {
    it.each([
      ["an absolute URL", "https://evil.example/steal"],
      ["a scheme-relative URL", "//evil.example/steal"],
      // A browser folds the backslash into a second slash, which turns this
      // into the case above. The URL parser does the same, which is why one
      // origin comparison covers both.
      ["the backslash variant", "/\\evil.example/steal"],
      ["a javascript: URL", "javascript:alert(1)"],
      ["a data: URL", "data:text/html,<script>alert(1)</script>"],
      ["an http URL back to another host", "http://evil.example"],
    ])("rejects %s", (_label, value) => {
      expect(sanitizeReturnTo({ redirect: value })).toBeUndefined()
    })
  })

  describe("rejects anything that is not a single path", () => {
    it("rejects a repeated parameter", () => {
      // Arrives as an array. No honest link sends two destinations, so the
      // second one is someone probing.
      expect(
        sanitizeReturnTo({ redirect: ["/posts", "https://evil.example"] })
      ).toBeUndefined()
    })

    it("rejects an empty value", () => {
      expect(sanitizeReturnTo({ redirect: "" })).toBeUndefined()
    })

    it("returns undefined when the parameter is absent", () => {
      expect(sanitizeReturnTo({})).toBeUndefined()
      expect(sanitizeReturnTo({ other: "/posts" })).toBeUndefined()
    })
  })
})

describe("authPath", () => {
  it("links to the page alone when there is nowhere to return to", () => {
    expect(authPath("/signin")).toBe("/signin")
    expect(authPath("/signup", undefined)).toBe("/signup")
  })

  it("encodes the destination", () => {
    expect(authPath("/signin", "/posts")).toBe("/signin?redirect=%2Fposts")
  })

  it("encodes a destination carrying its own query string", () => {
    // Unencoded, the `&` would split into a second parameter of the auth
    // page's own URL and the tail would be lost.
    expect(authPath("/signup", "/posts?page=2&sort=new")).toBe(
      "/signup?redirect=%2Fposts%3Fpage%3D2%26sort%3Dnew"
    )
  })

  it("round-trips through the guard", () => {
    // The two halves are only useful together: whatever authPath writes has
    // to be something sanitizeReturnTo hands back unchanged.
    const destination = "/posts?page=2#latest"
    const url = new URL(authPath("/signin", destination), "http://localhost")

    expect(
      sanitizeReturnTo({ redirect: url.searchParams.get("redirect")! })
    ).toBe(destination)
  })
})

describe("DEFAULT_DESTINATION", () => {
  it("is a same-origin path, so the fallback cannot itself leave the site", () => {
    expect(sanitizeReturnTo({ redirect: DEFAULT_DESTINATION })).toBe(
      DEFAULT_DESTINATION
    )
  })
})
