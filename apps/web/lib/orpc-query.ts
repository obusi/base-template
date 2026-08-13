// TanStack Query bindings for every procedure, derived from the contract.
//
//   useQuery(orpc.post.list.queryOptions({ input: { limit: 20 } }))
//   useMutation(orpc.post.create.mutationOptions())
//   queryClient.invalidateQueries({ queryKey: orpc.post.key() })
//
// Query keys come from the procedure path rather than hand-written strings, so
// invalidation cannot drift from the call it is meant to refresh.

import { createTanstackQueryUtils } from "@orpc/tanstack-query"

import { client } from "@/lib/orpc"

export const orpc = createTanstackQueryUtils(client)
