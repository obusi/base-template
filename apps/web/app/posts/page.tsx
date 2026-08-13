// Example domain — delete this folder when starting a real project. See
// docs/architecture.md section 11 for the full list.
//
// A Server Component, which is what makes this page indexable: the HTML that
// leaves the server already contains the posts. A `useQuery` version would ship
// an empty shell first, and link-preview bots do not run JavaScript at all.
//
// `client.post.list()` here does not make an HTTP request. On the server the
// same import resolves to an in-process caller — see lib/orpc.ts.

import { headers } from "next/headers"
import Link from "next/link"

import { auth } from "@packages/auth/server"

import { CreatePostForm } from "@/app/posts/create-post-form"
import { PostItem } from "@/app/posts/post-item"
import { SignOutButton } from "@/app/posts/sign-out-button"
import { client } from "@/lib/orpc"

export default async function PostsPage() {
  const [{ items }, session] = await Promise.all([
    client.post.list({ limit: 20 }),
    auth.api.getSession({ headers: await headers() }),
  ])

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-medium">Posts</h1>

        {session ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {session.user.email}
            </span>
            <SignOutButton />
          </div>
        ) : (
          <Link href="/login" className="text-sm underline">
            Sign in to post
          </Link>
        )}
      </header>

      {session && <CreatePostForm />}

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((post) => (
            <PostItem
              key={post.id}
              post={post}
              isOwner={post.authorId === session?.user.id}
            />
          ))}
        </ul>
      )}
    </main>
  )
}
