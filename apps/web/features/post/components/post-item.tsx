"use client"

// Example domain — delete alongside page.tsx.
//
// Edit and delete only appear on the caller's own posts. That is ordinary UX,
// not the security boundary: `packages/api` filters by `authorId` in the same
// `where` clause that finds the row, so a request forged past this component
// gets NOT_FOUND. Hiding a button is a courtesy; the server is the rule.

import { isDefinedError } from "@orpc/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useForm } from "react-hook-form"
import type { z } from "zod"

import { UpdatePostInput, type Post } from "@packages/contract"
import { Button } from "@packages/ui/components/button"
import { Input } from "@packages/ui/components/input"
import { Textarea } from "@packages/ui/components/textarea"
import { toast } from "@packages/ui/components/toast"

import { orpc } from "@/lib/orpc-query"

type Values = z.infer<typeof UpdatePostInput>

export function PostItem({ post, isOwner }: { post: Post; isOwner: boolean }) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const form = useForm<Values>({
    resolver: zodResolver(UpdatePostInput),
    defaultValues: { id: post.id, title: post.title, content: post.content },
  })

  function refresh() {
    router.refresh()
    void queryClient.invalidateQueries({ queryKey: orpc.post.key() })
  }

  // Written out at each call site rather than shared: `isDefinedError` narrows
  // against the error map of the procedure that threw, and a helper taking
  // `unknown` would narrow to `never` — the codes are only known per procedure.
  //
  // NOT_FOUND here means the row is gone or was never the caller's. The two are
  // deliberately indistinguishable — see packages/contract/src/errors.ts. It
  // is a toast rather than an inline error because it is not about any one
  // field in the form.
  const update = useMutation(
    orpc.post.update.mutationOptions({
      onSuccess: () => {
        setEditing(false)
        toast.add({ title: "Post updated.", type: "success" })
        refresh()
      },
      onError: (cause) =>
        toast.add({
          title:
            isDefinedError(cause) && cause.code === "NOT_FOUND"
              ? "That post is no longer yours to change."
              : "Something went wrong.",
          type: "error",
        }),
    })
  )

  const remove = useMutation(
    orpc.post.delete.mutationOptions({
      onSuccess: () => {
        toast.add({ title: "Post deleted.", type: "success" })
        refresh()
      },
      onError: (cause) =>
        toast.add({
          title:
            isDefinedError(cause) && cause.code === "NOT_FOUND"
              ? "That post is no longer yours to delete."
              : "Something went wrong.",
          type: "error",
        }),
    })
  )

  const busy = update.isPending || remove.isPending

  return (
    <li className="flex flex-col gap-2 border-b pb-4">
      {editing ? (
        <form
          onSubmit={form.handleSubmit((values) => update.mutate(values))}
          className="flex flex-col gap-2"
        >
          <Input {...form.register("title")} />
          {form.formState.errors.title && (
            <p className="text-sm text-destructive">
              {form.formState.errors.title.message}
            </p>
          )}

          <Textarea rows={3} {...form.register("content")} />
          {form.formState.errors.content && (
            <p className="text-sm text-destructive">
              {form.formState.errors.content.message}
            </p>
          )}

          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy}>
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              type="button"
              disabled={busy}
              onClick={() => {
                form.reset()
                setEditing(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <>
          <h2 className="font-medium">{post.title}</h2>
          <p className="text-sm whitespace-pre-wrap">{post.content}</p>

          <div className="flex items-center gap-3">
            <time
              dateTime={post.createdAt.toISOString()}
              className="text-xs text-muted-foreground"
            >
              {post.createdAt.toLocaleString()}
            </time>

            {isOwner && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </Button>

                {/* Two clicks rather than a dialog: enough to stop an accidental
                    delete without pulling in a modal for an example. */}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    if (!confirmingDelete) {
                      setConfirmingDelete(true)
                      return
                    }

                    remove.mutate({ id: post.id })
                  }}
                >
                  {confirmingDelete ? "Really delete?" : "Delete"}
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </li>
  )
}
