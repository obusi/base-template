// A Server Component so the page never round-trips through the browser just
// to find out whether someone is signed in.

import { client } from "@/lib/orpc"
import { getSession } from "@/lib/session"

import { ProfileForm } from "./components/profile-form"

export async function ProfilePage() {
  const session = await getSession()

  if (!session) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
        <p className="text-sm text-muted-foreground">
          Sign in to view your profile.
        </p>
      </main>
    )
  }

  const profile = await client.profile.me()

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <h1 className="text-xl font-medium">Profile</h1>
      <ProfileForm profile={profile} />
    </main>
  )
}
