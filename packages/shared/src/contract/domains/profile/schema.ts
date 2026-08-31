import { z } from "zod"

export const ProfileSchema = z.object({
  userId: z.string(),
  bio: z.string().nullable(),
  phone: z.string().nullable(),

  // Read-only from the caller's side, and it has to stay that way: this is
  // what `requireAdmin` reads. It is deliberately absent from
  // UpdateProfileInput below — `profileService.update` passes validated input straight
  // to `.set()`, so declaring `role` there would let anyone promote
  // themselves.
  role: z.string(),

  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Profile = z.infer<typeof ProfileSchema>

// Both fields optional and nullable: omitting one leaves it alone, sending
// `null` clears it. `role` is not here on purpose — see above.
export const UpdateProfileInput = z.object({
  bio: z.string().max(500).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
})
