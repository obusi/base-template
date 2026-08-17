"use client"

// Auth does not go through oRPC. `authClient` talks to /api/auth directly, and
// the same calls work from Expo later with only the storage swapped. See
// docs/architecture.md S4.
//
// No schema for this in packages/contract: there is no contract for auth (see
// docs/architecture.md S4), so the schema is local to the one form that needs
// it.

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { signIn } from "@packages/auth/client"
import { Button } from "@packages/ui/components/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@packages/ui/components/field"
import { Input } from "@packages/ui/components/input"
import { toast } from "@packages/ui/components/toast"

import { AuthHeader } from "./components/auth-header"
import { SocialButtons } from "./components/social-buttons"
import { TermsNotice } from "./components/terms-notice"
import {
  authPath,
  DEFAULT_DESTINATION,
  sanitizeReturnTo,
  type SearchParams,
} from "./redirect"

// Deliberately weaker than the sign-up schema: this form checks that a
// password was typed, not that it meets today's policy. Enforcing a length
// here would lock out anyone whose account predates a change to it, and the
// server rejects a wrong password regardless.
const SignInInput = z.object({
  email: z.email(),
  password: z.string().min(1, "Enter your password."),
})

type Values = z.infer<typeof SignInInput>

export function SignInPage({ searchParams }: { searchParams: SearchParams }) {
  const router = useRouter()

  // Undefined whenever nothing was asked for, or what was asked for would
  // have left the site — see redirect.ts.
  const returnTo = sanitizeReturnTo(searchParams)

  const form = useForm<Values>({
    resolver: zodResolver(SignInInput),
    defaultValues: { email: "", password: "" },
  })

  async function submit(values: Values) {
    const result = await signIn.email(values)

    if (result.error) {
      // Better Auth answers a wrong email and a wrong password with the same
      // message on purpose — telling them apart would confirm which addresses
      // have accounts. Show what it sends rather than narrowing it.
      toast.add({
        title: result.error.message ?? "Could not sign in.",
        type: "error",
      })
      return
    }

    toast.add({ title: "Signed in.", type: "success" })

    // The destination renders on the server and reads the session cookie, so
    // it has to be re-fetched rather than served from the router cache.
    router.push(returnTo ?? DEFAULT_DESTINATION)
    router.refresh()
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <form onSubmit={form.handleSubmit(submit)}>
          <FieldGroup>
            <AuthHeader
              prompt="Don't have an account?"
              actionHref={authPath("/signup", returnTo)}
              actionLabel="Sign up"
            />

            <Field data-invalid={!!form.formState.errors.email}>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                autoComplete="email"
                {...form.register("email")}
              />
              <FieldError errors={[form.formState.errors.email]} />
            </Field>

            <Field data-invalid={!!form.formState.errors.password}>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register("password")}
              />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>

            <Field>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Signing in…" : "Login"}
              </Button>
            </Field>

            <SocialButtons />
          </FieldGroup>
        </form>

        <TermsNotice />
      </div>
    </main>
  )
}
