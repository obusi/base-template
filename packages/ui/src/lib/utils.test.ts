import { describe, expect, it } from "vitest"

import { cn } from "@packages/ui/lib/utils"

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("px-2", "py-1")).toBe("px-2 py-1")
  })

  it("lets the last of two conflicting tailwind classes win", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("drops falsy values", () => {
    expect(cn("px-2", false, undefined, null, "py-1")).toBe("px-2 py-1")
  })

  it("flattens arrays and conditional objects", () => {
    expect(cn(["px-2", "py-1"], { "text-sm": true, "text-lg": false })).toBe(
      "px-2 py-1 text-sm"
    )
  })
})
