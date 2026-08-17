"use client"

// Step two of two, reached from the link `forgot-password-page.tsx` asked for.
//
// Better Auth checks the token before the browser ever gets here: its
// /api/auth/reset-password/:token route redirects to this page with either
// `?token=…` or `?error=INVALID_TOKEN`. So there are three states, and the
// page has to render all of them — nothing else in this app arrives already
// knowing it has failed.

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
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
import type { SearchParams } from "./redirect"

// `min(8)` is the floor Better Auth enforces on this route too, not only on
// sign-up — packages/auth/src/config.test.ts pins both.
const ResetPasswordInput = z.object({
  password: z.string().min(8, "Use at least 8 characters."),
})

type Values = z.infer<typeof ResetPasswordInput>

export function ResetPasswordPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const router = useRouter()
  const token = searchParams.token

  const form = useForm<Values>({
    resolver: zodResolver(ResetPasswordInput),
    defaultValues: { password: "" },
  })

  async function submit({ password }: Values) {
    if (typeof token !== "string") return

    const result = await authClient.resetPassword({
      newPassword: password,
      token,
    })

    if (result.error) {
      toast.add({
        title: result.error.message ?? "Could not reset the password.",
        type: "error",
      })
      return
    }

    // Resetting revokes every session this account had, this one included, so
    // there is nothing to refresh — signing in again is the only way forward.
    toast.add({ title: "Password changed. Sign in again.", type: "success" })
    router.push("/signin")
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        {typeof token !== "string" || token.length === 0 ? (
          <FieldGroup>
            <AuthHeader
              prompt="Need a new link?"
              actionHref="/forgot-password"
              actionLabel="Start again"
            />

            {/* Covers an expired link, a token already spent, and someone
                opening /reset-password directly. They are one message on
                purpose: the difference is not the person's to act on, and
                every one of them is fixed by asking for a fresh link. */}
            <FieldDescription className="text-center">
              That reset link is no longer valid. Links expire, and each one
              works only once.
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

              <Field data-invalid={!!form.formState.errors.password}>
                <FieldLabel htmlFor="password">New password</FieldLabel>
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
                  {form.formState.isSubmitting ? "Saving…" : "Set new password"}
                </Button>
              </Field>

              <FieldDescription className="text-center">
                Every device signed in to this account will be signed out.
              </FieldDescription>
            </FieldGroup>
          </form>
        )}
      </div>
    </main>
  )
}
