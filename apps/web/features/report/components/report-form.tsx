"use client"

// react-hook-form for the fields, useMutation for the call. The schema is
// `CreateReportInput` from the contract — the same object the server validates
// with, so there is no second copy to drift.

import { ORPCError } from "@orpc/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "@tanstack/react-query"
import { useSearchParams } from "next/navigation"
import { useRef, useState } from "react"
import { Controller, useForm } from "react-hook-form"
import type { z } from "zod"

import {
  AttachmentContentType,
  CreateReportInput,
  MAX_ATTACHMENTS,
  ReportCategory,
} from "@packages/contract"
import { Button } from "@packages/ui/components/button"
import { Label } from "@packages/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@packages/ui/components/select"
import { Textarea } from "@packages/ui/components/textarea"
import { toast } from "@packages/ui/components/toast"

import { client } from "@/lib/orpc"

import { formatBytes, validateAttachments } from "../attachments"
import { uploadAttachments } from "../upload"
import { readFrom, reportedPageUrl } from "../page-context"

// The two fields the person actually types. `attachments` and `pageUrl` are
// part of the same contract input but are not form state: one is the file
// picker's selection, the other is read from the URL, and both are assembled
// at submit. `.pick()` because these shapes genuinely coincide, not to save
// typing — see packages-contract.md.
const FormValues = CreateReportInput.pick({ category: true, message: true })

type Values = z.infer<typeof FormValues>

/**
 * What each category is called on screen, derived from the contract's enum
 * rather than written out beside it. A hand-kept map would be a second list to
 * update every time a category is added, and nothing would catch it drifting.
 *
 * `Select` reads this to render the collapsed trigger, which shows the label
 * of whatever is selected rather than its raw value.
 */
const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  ReportCategory.options.map((category) => [
    category,
    `${category[0]?.toUpperCase() ?? ""}${category.slice(1)}`,
  ])
)

export function ReportForm({
  attachmentsEnabled,
}: {
  attachmentsEnabled: boolean
}) {
  const searchParams = useSearchParams()
  const [files, setFiles] = useState<File[]>([])
  const [filesError, setFilesError] = useState<string>()
  const fileInput = useRef<HTMLInputElement>(null)

  const form = useForm<Values>({
    resolver: zodResolver(FormValues),
    defaultValues: { category: "bug", message: "" },
  })

  const clearFiles = () => {
    setFiles([])
    setFilesError(undefined)

    // The input keeps its own copy of the selection, and a `<input type=file>`
    // that still shows "2 files" after a successful send is a lie about what
    // the next submit would send.
    if (fileInput.current) fileInput.current.value = ""
  }

  // A custom `mutationFn` rather than `orpc.report.create.mutationOptions()`,
  // because sending a report is two calls now: upload the images, then create
  // the row that names them. Both have to succeed for the report to exist.
  const send = useMutation({
    mutationFn: async (values: Values) => {
      const attachments = await uploadAttachments(files)

      return client.report.create({
        ...values,
        attachments,
        pageUrl: reportedPageUrl(
          readFrom(searchParams),
          window.location.origin
        ),
      })
    },

    onSuccess: () => {
      form.reset()
      clearFiles()
      toast.add({ title: "Thanks — your report was sent.", type: "success" })
    },

    onError: (error) => {
      // The one failure the caller can act on: this deployment has no bucket
      // configured. Everything else is a bug, already logged server-side.
      if (
        error instanceof ORPCError &&
        error.code === "ATTACHMENTS_UNAVAILABLE"
      ) {
        setFilesError("Images cannot be attached on this deployment.")
        return
      }

      toast.add({ title: "Something went wrong.", type: "error" })
    },
  })

  const pickFiles = (selected: FileList | null) => {
    const picked = [...(selected ?? [])]

    setFiles(picked)
    setFilesError(validateAttachments(picked))
  }

  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        if (filesError) return
        send.mutate(values)
      })}
      className="flex flex-col gap-4 rounded-md border p-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="category">What is this about?</Label>

        {/*
          `Controller`, not `register`: this is Base UI's Select rather than a
          native <select>, so there is no DOM element for a ref to attach to
          and no change event to listen for — the value arrives through
          `onValueChange`.

          The options come from the contract's enum rather than a list written
          out here, so adding a category is one edit rather than two.
        */}
        <Controller
          control={form.control}
          name="category"
          render={({ field }) => (
            <Select
              items={CATEGORY_LABELS}
              name={field.name}
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger id="category" className="w-full">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                {ReportCategory.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {CATEGORY_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="message">What happened?</Label>
        <Textarea
          id="message"
          rows={5}
          placeholder="What you were doing, and what you expected instead."
          {...form.register("message")}
        />
        {form.formState.errors.message && (
          <p className="text-sm text-destructive">
            {form.formState.errors.message.message}
          </p>
        )}
      </div>

      {/*
        Hidden rather than shown-and-failing where no bucket is configured.
        `social-buttons.tsx` does the same for Google: an unconfigured switch
        removes its control instead of offering a door that cannot open. See
        docs/architecture.md S4.
      */}
      {attachmentsEnabled && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="attachments">
            Screenshots{" "}
            <span className="font-normal text-muted-foreground">
              (optional, up to {MAX_ATTACHMENTS})
            </span>
          </Label>

          <input
            id="attachments"
            ref={fileInput}
            type="file"
            multiple
            accept={AttachmentContentType.options.join(",")}
            onChange={(event) => pickFiles(event.target.files)}
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:text-secondary-foreground"
          />

          {files.length > 0 && !filesError && (
            <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
              {files.map((file) => (
                <li key={file.name}>
                  {file.name} · {formatBytes(file.size)}
                </li>
              ))}
            </ul>
          )}

          {filesError && (
            <p className="text-sm text-destructive">{filesError}</p>
          )}
        </div>
      )}

      <Button
        type="submit"
        disabled={send.isPending || Boolean(filesError)}
        className="self-start"
      >
        {send.isPending ? "Sending…" : "Send report"}
      </Button>
    </form>
  )
}
