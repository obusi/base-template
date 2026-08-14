"use client"

// Example domain — delete alongside page.tsx.

import { useRouter } from "next/navigation"
import { useState } from "react"

import { signOut } from "@packages/auth/client"
import { Button } from "@packages/ui/components/button"

export function SignOutButton() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        setPending(true)

        void signOut().then(() => {
          // The page is server-rendered from the session cookie, so the cache
          // has to be dropped or the signed-in version stays on screen.
          router.refresh()
          setPending(false)
        })
      }}
    >
      Sign out
    </Button>
  )
}
