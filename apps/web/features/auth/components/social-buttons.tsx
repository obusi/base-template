"use client"

// The social sign-in row, kept ready but switched off.
//
// It renders nothing today because `packages/auth/src/config.ts` declares no
// social providers — a visible "Continue with Google" button would fail the
// moment anyone pressed it. The markup is parked here rather than deleted so
// that turning it on is an edit in one file instead of a rewrite in two: both
// auth pages already render `<SocialButtons />`, so uncommenting below makes
// it appear on each of them at once.
//
// To enable it:
//   1. Add the provider in packages/auth/src/config.ts:
//        socialProviders: { google: { clientId: …, clientSecret: … } }
//      with both values declared in packages/auth/src/env.ts, so a missing
//      one is a startup error rather than a runtime redirect to nowhere.
//   2. Uncomment the two blocks below.
//
// The block this came from also offered Apple. It was dropped rather than
// parked: Apple sign-in needs a paid developer account and a signing key,
// which is a different order of commitment from adding an OAuth client.

// import { signIn } from "@packages/auth/client"
// import { Button } from "@packages/ui/components/button"
// import { Field, FieldSeparator } from "@packages/ui/components/field"

export function SocialButtons() {
  return null

  // return (
  //   <>
  //     <FieldSeparator>Or</FieldSeparator>
  //     <Field>
  //       <Button
  //         variant="outline"
  //         type="button"
  //         onClick={() => signIn.social({ provider: "google" })}
  //       >
  //         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  //           <path
  //             d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
  //             fill="currentColor"
  //           />
  //         </svg>
  //         Continue with Google
  //       </Button>
  //     </Field>
  //   </>
  // )
}
