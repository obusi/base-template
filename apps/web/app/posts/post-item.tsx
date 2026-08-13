"use client"

// Example domain — delete alongside page.tsx.
//
// Edit and delete only appear on the caller's own posts. That is ordinary UX,
// not the security boundary: `packages/api` filters by `authorId` in the same
// `where` clause that finds the row, so a request forged past this component
// gets NOT_FOUND. Hiding a button is a courtesy; the server is the rule.

import { isDefinedError } from "@orpc/client"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useState } from "react"

import type { Post } from "@packages/contract"
import { Button } from "@packages/ui/components/button"
import { Input } from "@packages/ui/components/input"
import { Textarea } from "@packages/ui/components/textarea"

import { orpc } from "@/lib/orpc-query"

export function PostItem({ post, isOwner }: { post: Post; isOwner: boolean }) {
  const router = useRouter()
  const queryClient = useQueryClient()

  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [title, setTitle] = useState(post.title)
  const [content, setContent] = useState(post.content)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    router.refresh()
    void queryClient.invalidateQueries({ queryKey: orpc.post.key() })
  }

  // Written out at each call site rather than shared: `isDefinedError` narrows
  // against the error map of the procedure that threw, and a helper taking
  // `unknown` would narrow to `never` — the codes are only known per procedure.
  //
  // NOT_FOUND here means the row is gone or was never the caller's. The two are
  // deliberately indistinguishable — see packages/contract/src/errors.ts.
  const update = useMutation(
    orpc.post.update.mutationOptions({
      onSuccess: () => {
        setEditing(false)
        setError(null)
        refresh()
      },
      onError: (cause) =>
        setError(
          isDefinedError(cause) && cause.code === "NOT_FOUND"
            ? "That post is no longer yours to change."
            : "Something went wrong."
        ),
    })
  )

  const remove = useMutation(
    orpc.post.delete.mutationOptions({
      onSuccess: refresh,
      onError: (cause) =>
        setError(
          isDefinedError(cause) && cause.code === "NOT_FOUND"
            ? "That post is no longer yours to delete."
            : "Something went wrong."
        ),
    })
  )

  const busy = update.isPending || remove.isPending

  return (
    <li className="flex flex-col gap-2 border-b pb-4">
      {editing ? (
        <>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() => update.mutate({ id: post.id, title, content })}
            >
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setTitle(post.title)
                setContent(post.content)
                setEditing(false)
                setError(null)
              }}
            >
              Cancel
            </Button>
          </div>
        </>
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

      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  )
}
