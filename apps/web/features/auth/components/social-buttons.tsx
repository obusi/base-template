"use client"

// The social sign-in row. Apple was dropped rather than parked here: Apple
// sign-in needs a paid developer account and a signing key, a different order
// of commitment than adding an OAuth client. Google is the one provider this
// template ships wired — `packages/auth/src/config.ts` adds more the same way
// if a project needs them, via `socialProviders`.
//
// This button always renders once this file is in this state. What actually
// gates Google sign-in is the server: `packages/auth/src/config.ts` only adds
// `google` to `socialProviders` when `GOOGLE_CLIENT_ID` and
// `GOOGLE_CLIENT_SECRET` are both set (see `packages/auth/src/env.ts`), so a
// project that hasn't configured Google gets a button that answers
// PROVIDER_NOT_FOUND on click rather than silently mis-hiding.

import { signIn } from "@packages/auth/client"
import { Button } from "@packages/ui/components/button"
import { Field, FieldSeparator } from "@packages/ui/components/field"

export function SocialButtons({ callbackURL }: { callbackURL?: string }) {
  return (
    <>
      <FieldSeparator>Or</FieldSeparator>
      <Field>
        <Button
          variant="outline"
          type="button"
          onClick={() => signIn.social({ provider: "google", callbackURL })}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path
              d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
              fill="currentColor"
            />
          </svg>
          Continue with Google
        </Button>
      </Field>
    </>
  )
}
