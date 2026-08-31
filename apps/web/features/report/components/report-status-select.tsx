"use client"

// The write side of the admin list: one dropdown per report, saving as soon as
// it changes.
//
// No flag is read here, and none can be — `lib/features.ts` is `server-only`.
// The page decides whether to render this at all; by the time the component
// exists, the answer is yes. That is why it takes no `enabled` prop: a client
// component that knew about the flag would have to be edited on release, and
// releasing should cost this file nothing.

import { isDefinedError } from "@orpc/client"
import { useMutation } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { ReportStatus } from "@packages/shared"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select"
import { toast } from "@packages/ui/components/toast"

import { orpc } from "@/lib/orpc-query"

type Status = (typeof ReportStatus.options)[number]

/**
 * Derived from the contract's enum rather than written out beside it, the same
 * way the report form derives its category labels. A hand-kept map is a second
 * list to update, and nothing catches it drifting.
 */
const LABELS: Record<string, string> = Object.fromEntries(
  ReportStatus.options.map((status) => [
    status,
    `${status[0]?.toUpperCase() ?? ""}${status.slice(1)}`,
  ])
)

export function ReportStatusSelect({
  reportId,
  status,
}: {
  reportId: string
  status: string
}) {
  const router = useRouter()

  // The server's answer arrives with the next render, and a select that snapped
  // back to the old value until then would look broken. Seeded from the prop,
  // which is the row as the page rendered it.
  const [value, setValue] = useState(status)

  const update = useMutation(
    orpc.report.updateStatus.mutationOptions({
      onSuccess: (updated) => {
        setValue(updated.status)
        router.refresh()
      },

      onError: (cause) => {
        // Put back what was on screen before the change failed, so the control
        // never claims a status the database does not hold.
        setValue(status)

        toast.add({
          title:
            isDefinedError(cause) && cause.code === "NOT_FOUND"
              ? "That report is no longer there."
              : "Something went wrong.",
          type: "error",
        })
      },
    })
  )

  return (
    <Select
      value={value}
      disabled={update.isPending}
      onValueChange={(next) => {
        // Base UI hands back `null` for a cleared selection. Nothing here can
        // clear one — every option is a real status — so there is no request
        // to make, and writing an empty status would be worse than ignoring it.
        if (next === null) return

        setValue(next)
        update.mutate({ id: reportId, status: next as Status })
      }}
    >
      <SelectTrigger size="sm" className="w-36" aria-label="Status">
        <SelectValue>{LABELS[value] ?? value}</SelectValue>
      </SelectTrigger>

      <SelectContent>
        {ReportStatus.options.map((option) => (
          <SelectItem key={option} value={option}>
            {LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
