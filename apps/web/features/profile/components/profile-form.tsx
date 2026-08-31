"use client"

// The schema is `UpdateProfileInput` from the contract — the same object the
// server validates with, so there is no second copy to drift out of step.

import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useForm } from "react-hook-form"
import type { z } from "zod"

import { UpdateProfileInput, type Profile } from "@packages/shared"
import { Button } from "@packages/ui/components/button"
import { Input } from "@packages/ui/components/input"
import { Label } from "@packages/ui/components/label"
import { Textarea } from "@packages/ui/components/textarea"
import { toast } from "@packages/ui/components/toast"

import { orpc } from "@/lib/orpc-query"

type Values = z.infer<typeof UpdateProfileInput>

export function ProfileForm({ profile }: { profile: Profile }) {
  const queryClient = useQueryClient()

  const form = useForm<Values>({
    resolver: zodResolver(UpdateProfileInput),
    defaultValues: { bio: profile.bio, phone: profile.phone },
  })

  const update = useMutation(
    orpc.profile.update.mutationOptions({
      onSuccess: () => {
        toast.add({ title: "Profile updated.", type: "success" })
        void queryClient.invalidateQueries({ queryKey: orpc.profile.key() })
      },

      onError: () => {
        toast.add({ title: "Something went wrong.", type: "error" })
      },
    })
  )

  return (
    <form
      onSubmit={form.handleSubmit((values) => update.mutate(values))}
      className="flex flex-col gap-4 rounded-md border p-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" rows={4} {...form.register("bio")} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" {...form.register("phone")} />
      </div>

      <Button type="submit" disabled={update.isPending} className="self-start">
        {update.isPending ? "Saving…" : "Save"}
      </Button>
    </form>
  )
}
