// A password-reset mailer for Resend, wired in only when an API key is present.
//
// Resend rather than SMTP because it needs no dependency at all: Node's global
// `fetch` and a bearer token. A project that prefers another provider replaces
// this file with the equivalent twenty lines, or drops it and passes its own
// `sendResetPassword` to `createAuth` — see docs/architecture.md S4.
//
// The parameter is deliberately narrower than `ResetPasswordRequest`: an email
// needs the address and the link, and nothing else here should grow a
// dependency on the rest of the user record.

export type ResendOptions = {
  apiKey: string
  /**
   * Must be an address on a domain verified with Resend. Until a project has
   * one, `onboarding@resend.dev` works — but Resend will then only deliver to
   * the address that owns the account, which is enough to test with and not
   * enough to ship.
   */
  from: string
}

export function resendSender({ apiKey, from }: ResendOptions) {
  return async ({ user, url }: { user: { email: string }; url: string }) => {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: user.email,
        subject: "Reset your password",
        text:
          `Someone asked to reset the password for this address.\n\n${url}\n\n` +
          `The link works once and expires within the hour. ` +
          `If it was not you, nothing has changed and you can ignore this.`,
      }),
    })

    // Loud on purpose. `/request-password-reset` answers the browser "if that
    // address exists, a link is on its way" whether or not the send worked, so
    // swallowing this would leave the failure invisible to everyone.
    if (!response.ok) {
      throw new Error(
        `Resend refused the password-reset email: ${response.status} ${await response.text()}`
      )
    }
  }
}
