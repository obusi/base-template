// A stand-in for the real thing, exported rather than kept private because the
// package that consumes `Storage` is the one that needs to fake it.
//
// `@packages/api` reaches for this from its own test helpers, the same way it
// reaches for `@packages/db/testing`.

import type { Storage } from "../index"

/**
 * Object storage that records what it was asked for instead of talking to
 * Supabase.
 *
 * The only stand-in in this repo, and it earns the exception: storage is an
 * HTTP service on somebody else's machine, where the database is Postgres
 * compiled to WASM that boots in 1.4 seconds. What is worth testing here is
 * this repo's own logic — which paths are minted, whose prefix they carry,
 * that a URL is signed per attachment — and all of that is visible from here.
 */
export function fakeStorage(): Storage & { readonly signed: string[] } {
  const signed: string[] = []

  return {
    signed,
    createUploadUrl: (path) => {
      signed.push(path)
      return Promise.resolve({
        path,
        uploadUrl: `https://storage.test/upload/${path}`,
      })
    },
    createDownloadUrl: (path) =>
      Promise.resolve(`https://storage.test/download/${path}`),
  }
}
