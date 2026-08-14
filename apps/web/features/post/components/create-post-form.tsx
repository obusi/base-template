"use client"

// Example domain — delete alongside page.tsx.
//
// The half of the app that runs in the browser: react-hook-form for the fields,
// useMutation for the call. The schema is `CreatePostInput` from the contract —
// the same object the server validates with. There is no second copy to drift
// out of step, which is the point of contract-first.

import { isDefinedError } from "@orpc/client"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import type { z } from "zod"

import { CreatePostInput } from "@packages/contract"
import { Button } from "@packages/ui/components/button"
import { Input } from "@packages/ui/components/input"
import { Label } from "@packages/ui/components/label"
import { Textarea } from "@packages/ui/components/textarea"

import { orpc } from "@/lib/orpc-query"

type Values = z.infer<typeof CreatePostInput>

export function CreatePostForm() {
  const router = useRouter()
  const queryClient = useQueryClient()

  const form = useForm<Values>({
    resolver: zodResolver(CreatePostInput),
    defaultValues: { title: "", content: "" },
  })

  const create = useMutation(
    orpc.post.create.mutationOptions({
      onSuccess: () => {
        form.reset()

        // The list on this page was rendered on the server, so it lives in the
        // router cache rather than in TanStack Query. Both are refreshed: the
        // second line matters once something on the page reads the list through
        // useQuery.
        router.refresh()
        void queryClient.invalidateQueries({ queryKey: orpc.post.key() })
      },

      onError: (error) => {
        // `isDefinedError` narrows to the errors this procedure declared, which
        // is what makes `error.data.limit` below type-check. Anything it does
        // not match is a bug: the user gets a generic message, and the detail
        // stays in the server log where the interceptor put it.
        if (isDefinedError(error) && error.code === "QUOTA_EXCEEDED") {
          form.setError("title", {
            message: `You have reached the limit of ${error.data.limit} posts.`,
          })
          return
        }

        form.setError("root", { message: "Something went wrong." })
      },
    })
  )

  return (
    <form
      onSubmit={form.handleSubmit((values) => create.mutate(values))}
      className="flex flex-col gap-4 rounded-md border p-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" {...form.register("title")} />
        {form.formState.errors.title && (
          <p className="text-sm text-destructive">
            {form.formState.errors.title.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="content">Content</Label>
        <Textarea id="content" rows={4} {...form.register("content")} />
        {form.formState.errors.content && (
          <p className="text-sm text-destructive">
            {form.formState.errors.content.message}
          </p>
        )}
      </div>

      {form.formState.errors.root && (
        <p className="text-sm text-destructive">
          {form.formState.errors.root.message}
        </p>
      )}

      <Button type="submit" disabled={create.isPending} className="self-start">
        {create.isPending ? "Posting…" : "Post"}
      </Button>
    </form>
  )
}
