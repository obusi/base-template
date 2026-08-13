"use client"

// Example domain — delete alongside app/posts/.
//
// Auth does not go through oRPC. `authClient` talks to /api/auth directly, and
// the same calls work from Expo later with only the storage swapped. See
// docs/architecture.md section 5.

import { useState } from "react"
import { useRouter } from "next/navigation"

import { signIn, signUp } from "@packages/auth/client"
import { Button } from "@packages/ui/components/button"
import { Input } from "@packages/ui/components/input"
import { Label } from "@packages/ui/components/label"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(mode: "sign-in" | "sign-up") {
    setPending(true)
    setError(null)

    const result =
      mode === "sign-in"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name: email })

    setPending(false)

    if (result.error) {
      setError(result.error.message ?? "Could not sign in.")
      return
    }

    // The posts page renders on the server and reads the session cookie, so it
    // has to be re-fetched rather than served from the router cache.
    router.push("/posts")
    router.refresh()
  }

  return (
    <main className="mx-auto flex max-w-sm flex-col gap-4 p-6">
      <h1 className="text-xl font-medium">Sign in</h1>

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={() => void submit("sign-in")} disabled={pending}>
          Sign in
        </Button>
        <Button
          variant="outline"
          onClick={() => void submit("sign-up")}
          disabled={pending}
        >
          Create account
        </Button>
      </div>
    </main>
  )
}
