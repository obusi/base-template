"use client"

// Example domain — delete alongside app/posts/.
//
// Auth does not go through oRPC. `authClient` talks to /api/auth directly, and
// the same calls work from Expo later with only the storage swapped. See
// docs/architecture.md section 5.
//
// No schema for this in packages/contract: there is no contract for auth (see
// docs/architecture.md section 5), so this schema is local to the one form
// that needs it. `min(8)` matches Better Auth's default minPasswordLength in
// packages/auth/src/config.ts — update both together if that ever changes.

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { signIn, signUp } from "@packages/auth/client"
import { Button } from "@packages/ui/components/button"
import { Input } from "@packages/ui/components/input"
import { Label } from "@packages/ui/components/label"
import { toast } from "@packages/ui/components/toast"

const LoginInput = z.object({
  email: z.email(),
  password: z.string().min(8),
})

type Values = z.infer<typeof LoginInput>

export function LoginPage() {
  const router = useRouter()

  const form = useForm<Values>({
    resolver: zodResolver(LoginInput),
    defaultValues: { email: "", password: "" },
  })

  async function submit(mode: "sign-in" | "sign-up", values: Values) {
    const result =
      mode === "sign-in"
        ? await signIn.email(values)
        : await signUp.email({ ...values, name: values.email })

    if (result.error) {
      toast.add({
        title: result.error.message ?? "Could not sign in.",
        type: "error",
      })
      return
    }

    toast.add({
      title: mode === "sign-in" ? "Signed in." : "Account created.",
      type: "success",
    })

    // The posts page renders on the server and reads the session cookie, so it
    // has to be re-fetched rather than served from the router cache.
    router.push("/posts")
    router.refresh()
  }

  const pending = form.formState.isSubmitting

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-medium">Sign in</h1>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          {...form.register("email")}
        />
        {form.formState.errors.email && (
          <p className="text-sm text-destructive">
            {form.formState.errors.email.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...form.register("password")}
        />
        {form.formState.errors.password && (
          <p className="text-sm text-destructive">
            {form.formState.errors.password.message}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button
          onClick={form.handleSubmit((values) => submit("sign-in", values))}
          disabled={pending}
        >
          Sign in
        </Button>
        <Button
          variant="outline"
          onClick={form.handleSubmit((values) => submit("sign-up", values))}
          disabled={pending}
        >
          Create account
        </Button>
      </div>
    </main>
  )
}
