import { z } from "zod"

export const ProfileSchema = z.object({
  userId: z.string(),
  bio: z.string().nullable(),
  phone: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Profile = z.infer<typeof ProfileSchema>

// Both fields optional and nullable: omitting one leaves it alone, sending
// `null` clears it.
export const UpdateProfileInput = z.object({
  bio: z.string().max(500).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
})
