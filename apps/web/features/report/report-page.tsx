// A Server Component, so the page knows whether someone is signed in before
// the HTML leaves the server rather than after a client-side check catches up.

import Link from "next/link"

import { buttonVariants } from "@packages/ui/components/button"

import { authPath } from "@/features/auth"
import { env } from "@/env"
import { getSession } from "@/lib/session"

import { ReportForm } from "./components/report-form"

export async function ReportPage() {
  const session = await getSession()

  // Decided here rather than in the form, because it is a fact about the
  // deployment and the server already knows it — asking the API would mean a
  // round trip to learn something that cannot change while the page is open.
  const attachmentsEnabled = Boolean(
    env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  )

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-medium">Report a problem</h1>
        <p className="text-sm text-muted-foreground">
          Tell us what went wrong. We record the page you came from and your
          browser automatically, so there is nothing else to fill in.
        </p>
      </div>

      {session ? (
        <ReportForm attachmentsEnabled={attachmentsEnabled} />
      ) : (
        <div className="flex flex-col items-start gap-4 rounded-md border p-4">
          <p className="text-sm text-muted-foreground">
            Sign in to send a report, so we can follow it up with you.
          </p>
          <Link href={authPath("/signin")} className={buttonVariants()}>
            Sign in
          </Link>
        </div>
      )}
    </main>
  )
}
