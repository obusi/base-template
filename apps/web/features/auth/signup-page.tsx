"use client"

// The sign-up half of the pair. See signin-page.tsx for why auth bypasses
// oRPC and why the schema lives beside the form rather than in the contract.

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { signUp } from "@packages/auth/client"
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

// `name` is required by Better Auth's /sign-up/email endpoint, not optional —
// so it is a real field rather than something derived from the email address.
// `min(8)` matches Better Auth's default minPasswordLength; if
// packages/auth/src/config.ts ever sets its own, update both together.
const SignUpInput = z.object({
  name: z.string().min(1, "Enter your name."),
  email: z.email(),
  password: z.string().min(8, "Use at least 8 characters."),
})

type Values = z.infer<typeof SignUpInput>

export function SignUpPage({
  searchParams,
  googleEnabled,
}: {
  searchParams: SearchParams
  googleEnabled: boolean
}) {
  const router = useRouter()

  // Carried over from the sign-in page when someone switched, so arriving via
  // a protected link and choosing "create an account" still lands correctly.
  const returnTo = sanitizeReturnTo(searchParams)

  const form = useForm<Values>({
    resolver: zodResolver(SignUpInput),
    defaultValues: { name: "", email: "", password: "" },
  })

  async function submit(values: Values) {
    const result = await signUp.email(values)

    if (result.error) {
      // An address that is already registered comes back here. It is attached
      // to the email field rather than thrown in a toast, because that is the
      // field the person has to change.
      //
      // Better Auth defines both USER_ALREADY_EXISTS and this longer one; the
      // sign-up route throws this one. Check the route rather than the code
      // list if a version bump makes this branch stop firing.
      if (result.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        form.setError("email", {
          message: "An account with this email already exists.",
        })
        return
      }

      toast.add({
        title: result.error.message ?? "Could not create the account.",
        type: "error",
      })
      return
    }

    toast.add({ title: "Account created.", type: "success" })

    // Same reason as sign-in: the destination reads the session cookie on the
    // server, so the router cache has to be dropped.
    router.push(returnTo ?? DEFAULT_DESTINATION)
    router.refresh()
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <form onSubmit={form.handleSubmit(submit)}>
          <FieldGroup>
            <AuthHeader
              prompt="Already have an account?"
              actionHref={authPath("/signin", returnTo)}
              actionLabel="Sign in"
            />

            <Field data-invalid={!!form.formState.errors.name}>
              <FieldLabel htmlFor="name">Name</FieldLabel>
              <Input id="name" autoComplete="name" {...form.register("name")} />
              <FieldError errors={[form.formState.errors.name]} />
            </Field>

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
                autoComplete="new-password"
                {...form.register("password")}
              />
              <FieldError errors={[form.formState.errors.password]} />
            </Field>

            <Field>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creating…" : "Create Account"}
              </Button>
            </Field>

            <SocialButtons
              callbackURL={returnTo ?? DEFAULT_DESTINATION}
              enabled={googleEnabled}
            />
          </FieldGroup>
        </form>

        <TermsNotice />
      </div>
    </main>
  )
}
