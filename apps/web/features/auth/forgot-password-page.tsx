"use client"

// Step one of two. This page asks for an address; `reset-password-page.tsx`
// handles the link that arrives.
//
// See signin-page.tsx for why auth bypasses oRPC and why the schema lives
// beside the form rather than in the contract.

import { zodResolver } from "@hookform/resolvers/zod"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { authClient } from "@packages/auth/client"
import { Button } from "@packages/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@packages/ui/components/field"
import { Input } from "@packages/ui/components/input"
import { toast } from "@packages/ui/components/toast"

import { AuthHeader } from "./components/auth-header"

const ForgotPasswordInput = z.object({
  email: z.email(),
})

type Values = z.infer<typeof ForgotPasswordInput>

export function ForgotPasswordPage() {
  // Not a toast: this message is the entire result of the page, and a toast
  // that fades takes it away while the person is still reading.
  const [sent, setSent] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(ForgotPasswordInput),
    defaultValues: { email: "" },
  })

  async function submit({ email }: Values) {
    const result = await authClient.requestPasswordReset({
      email,
      // Where Better Auth sends the browser once it has checked the token. It
      // arrives there as `?token=…`, or `?error=INVALID_TOKEN` if the link has
      // expired — both handled by reset-password-page.tsx.
      redirectTo: "/reset-password",
    })

    if (result.error) {
      toast.add({
        title: result.error.message ?? "Could not send the reset link.",
        type: "error",
      })
      return
    }

    setSent(true)
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {sent ? (
          <FieldGroup>
            <AuthHeader
              prompt="Remembered it?"
              actionHref="/signin"
              actionLabel="Sign in"
            />

            {/* Deliberately says nothing about whether that address has an
                account. This form takes an email from anyone, with no
                password, so a "no such account" answer here would let anyone
                test addresses against the user list. The server behaves the
                same way — see packages/auth/src/config.test.ts. */}
            <FieldDescription className="text-center">
              If an account exists for that address, a reset link is on its way.
              The link can only be used once, and expires within the hour.
            </FieldDescription>
          </FieldGroup>
        ) : (
          <form onSubmit={form.handleSubmit(submit)}>
            <FieldGroup>
              <AuthHeader
                prompt="Remembered it?"
                actionHref="/signin"
                actionLabel="Sign in"
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

              <Field>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        )}
      </div>
    </main>
  )
}
