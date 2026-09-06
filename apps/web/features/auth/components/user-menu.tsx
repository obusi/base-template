"use client"

// The signed-in half of the navbar's right side — an avatar that opens a menu
// with the account's identity, a link to the profile page, a placeholder
// Settings destination, the theme control, and sign out.
//
// The theme control is here rather than in the navbar only while there is a
// session: a signed-out visitor gets the single-icon version beside "Sign in"
// instead, because there is no menu to put it in. components/theme-toggle.tsx
// holds both shapes and says why.
//
// Settings stays `href="#"` on purpose, same as the Terms and Privacy links
// in terms-notice.tsx: where it points is a product decision, not one this
// template makes on a project's behalf.
//
// Every item sits inside a DropdownMenuGroup, including the standalone label
// and the standalone sign-out item — Base UI's menu did not open reliably
// without it.

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { signOut } from "@packages/auth/client"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@packages/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@packages/ui/components/dropdown-menu"

import { ThemeToggleGroup } from "@/components/theme-toggle"

export function UserMenu({
  name,
  email,
  image,
  extraItems,
}: {
  name: string
  email: string
  image?: string | null

  /**
   * Menu entries owned by other features, rendered beside Profile and
   * Settings. Passed in rather than imported, because this file is a Client
   * Component and a feature's barrel can carry `server-only` pages with it —
   * `components/nav-bar.tsx` does the importing instead.
   */
  extraItems?: React.ReactNode
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  function handleSignOut() {
    setPending(true)

    void signOut().then(() => {
      // The navbar reads the session on the server, so the cache has to be
      // dropped or the signed-in version stays on screen.
      router.refresh()
      setPending(false)
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <Avatar>
          {image && <AvatarImage src={image} alt="" />}
          <AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{name}</span>
              <span className="text-xs text-muted-foreground">{email}</span>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/profile" />}>
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href="#" />}>Settings</DropdownMenuItem>
          {extraItems}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {/* Not a DropdownMenuItem: the row holds a control rather than being
            one, so it must not take focus or close the menu when clicked.
            The label carries the meaning the three icons only imply. */}
        <div className="flex items-center justify-between gap-4 px-2 py-1.5">
          <span className="text-sm">Theme</span>
          <ThemeToggleGroup />
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            disabled={pending}
            onClick={handleSignOut}
            variant="destructive"
          >
            {pending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
