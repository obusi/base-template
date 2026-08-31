// Example domain — delete this folder when starting a real project. See
// docs/template.md S14 for the full list.
//
// A Server Component, which is what makes this page indexable: the HTML that
// leaves the server already contains the first page of posts. A `useQuery`
// version would ship an empty shell first, and link-preview bots do not run
// JavaScript at all.
//
// `client.post.list()` here does not make an HTTP request. On the server the
// same import resolves to an in-process caller — see lib/orpc.ts.
//
// The rows themselves are rendered by a Client Component, because the list
// grows as the reader scrolls. That split is the usual one: the server fetches
// what the page opens with, the client owns what happens next.

import { client } from "@/lib/orpc"
import { PAGE_SIZE } from "@/lib/pagination"
import { getSession } from "@/lib/session"

import { CreatePostForm } from "./components/create-post-form"
import { PostList } from "./components/post-list"

export async function PostsPage() {
  const [firstPage, session] = await Promise.all([
    client.post.list({ limit: PAGE_SIZE }),
    getSession(),
  ])

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 p-6">
      <h1 className="text-xl font-medium">Posts</h1>

      {session && <CreatePostForm />}

      <PostList initialPage={firstPage} viewerId={session?.user.id} />
    </main>
  )
}
