import { implement } from "@orpc/server"

import { contract } from "@packages/contract"

import type { ApiContext } from "@packages/api/context"

/**
 * The builder every procedure starts from. `implement` binds it to the
 * contract, so a handler whose return value drifts from the declared
 * `.output()` stops compiling — the contract is not documentation that can go
 * stale, it is the type.
 */
export const os = implement(contract).$context<ApiContext>()
