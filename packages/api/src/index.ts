// This package composes the contract, the database, and auth into runnable
// procedures. It deliberately does **not** re-export `db`: `apps/web` reaches
// the database only through a procedure, and a convenience re-export here would
// quietly reopen the door the package split exists to close.

import { os } from "@packages/api/orpc"
import { postRouter } from "@packages/api/router/post"

export const router = os.router({
  post: postRouter,
})

export type Router = typeof router

export type { ApiContext } from "@packages/api/context"
