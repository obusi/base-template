// The one place this repo builds an outbound HTTP request by hand, so it is
// the one place a typo in a header name is invisible until a real reset fails.
//
// `fetch` is stubbed rather than called: Resend is someone else's service, and
// a test that needed an API key would not run for anyone who cloned this.

import { afterEach, describe, expect, it, vi } from "vitest"

import { resendSender } from "./resend"

const RESET = {
  user: { email: "someone@example.com", name: "Someone" },
  url: "http://localhost:3000/api/auth/reset-password/tok3n?callbackURL=/reset-password",
  token: "tok3n",
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Stub `fetch` with the given response and record what it was called with. */
function stubFetch(response: Partial<Response>) {
  const calls: { url: string; init: RequestInit }[] = []

  vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve(""),
      ...response,
    } as Response)
  })

  return calls
}

describe("resendSender", () => {
  it("posts the reset link to Resend", async () => {
    const calls = stubFetch({})

    await resendSender({ apiKey: "re_test", from: "hi@example.com" })(RESET)

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe("https://api.resend.com/emails")

    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer re_test")

    const body = JSON.parse(calls[0]!.init.body as string)
    expect(body.from).toBe("hi@example.com")
    expect(body.to).toBe("someone@example.com")
    // The link is the entire point of the email. Everything else is wrapping.
    expect(body.text).toContain(RESET.url)
  })

  it("throws when Resend refuses", async () => {
    stubFetch({
      ok: false,
      status: 422,
      text: () => Promise.resolve("bad from"),
    })

    // Better Auth answers the browser "if that address exists, a link is on its
    // way" whatever happens here, so a swallowed error would leave nobody —
    // not the person, not the logs — aware that nothing was sent.
    await expect(
      resendSender({ apiKey: "re_test", from: "hi@example.com" })(RESET)
    ).rejects.toThrow(/422/)
  })
})
