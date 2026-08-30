// Object storage, as two functions and an implementation of them.
//
// A package of its own so that `@packages/api` cannot resolve
// `@supabase/storage-js` at all — pnpm strict layout turns "the API layer does
// not know which provider it talks to" from a convention into a build failure,
// the same mechanism that stops `apps/web` reaching the database.
//
// The port exists for the same reason `ApiContext` takes a `Database` rather
// than importing one: a handler reaching for a module-level Supabase client
// could not be pointed anywhere else, and every test touching an attachment
// would need a real bucket. That stand-in is `@packages/storage/testing`, and
// it is the one place in the repo where a test gets a fake rather than the
// real thing — storage is an HTTP service on someone else's machine, which is
// not the same as a database that compiles to WASM and boots in 1.4 seconds.
//
// Nothing here names a domain. A bucket belongs to whatever stores files in
// it, so its name arrives as an argument.

import { StorageClient } from "@supabase/storage-js"

/**
 * How long an admin's signed image URL stays good — long enough to read a page
 * of reports, short enough that a URL copied out of devtools goes stale.
 *
 * There is no matching constant for uploads: `createSignedUploadUrl` takes no
 * expiry, and Supabase decides that one on its side.
 */
const DOWNLOAD_URL_TTL_SECONDS = 60 * 10

export type UploadTarget = {
  /** The object key the caller sends back with its report. */
  path: string
  /** Where to PUT the bytes. The only secret in the response. */
  uploadUrl: string
}

export type Storage = {
  createUploadUrl(path: string): Promise<UploadTarget>
  createDownloadUrl(path: string): Promise<string>
}

export type StorageConfig = {
  url: string
  serviceRoleKey: string
  bucket: string
}

/**
 * Backed by Supabase Storage, talking to it with the service role key.
 *
 * The bucket is private, so both directions are signed here and the browser
 * never holds a Supabase key of any kind — it gets a URL and uses `fetch`.
 * That is what lets this repo add object storage without also adopting the
 * anon key `docs/provisioning.md` went out of its way to leave switched off.
 */
export function createSupabaseStorage(config: StorageConfig): Storage {
  const bucket = new StorageClient(`${config.url}/storage/v1`, {
    apikey: config.serviceRoleKey,
    Authorization: `Bearer ${config.serviceRoleKey}`,
  }).from(config.bucket)

  return {
    async createUploadUrl(path) {
      const { data, error } = await bucket.createSignedUploadUrl(path)

      if (error || !data) {
        throw error ?? new Error(`no signed upload url for ${path}`)
      }

      return { path, uploadUrl: data.signedUrl }
    },

    async createDownloadUrl(path) {
      const { data, error } = await bucket.createSignedUrl(
        path,
        DOWNLOAD_URL_TTL_SECONDS
      )

      if (error || !data) {
        throw error ?? new Error(`no signed url for ${path}`)
      }

      return data.signedUrl
    },
  }
}

/**
 * Storage for one bucket, or `null` when the environment describes no Supabase
 * project at all.
 *
 * The bucket is a separate argument because it is the only part of this that
 * belongs to a domain. A project's URL and service key are the same for every
 * bucket it will ever hold, so a second domain adding a bucket calls this again
 * with a different name rather than needing a function of its own — and the
 * domain gets named once, at the composition root, which is what a composition
 * root is for.
 *
 * Both secrets have to be present: half a configuration is a deployment that
 * fails on somebody's first upload rather than at startup.
 */
export function storageFromEnv(
  config: {
    SUPABASE_URL?: string
    SUPABASE_SERVICE_ROLE_KEY?: string
  },
  bucket: string
): Storage | null {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) return null

  return createSupabaseStorage({
    url: config.SUPABASE_URL,
    serviceRoleKey: config.SUPABASE_SERVICE_ROLE_KEY,
    bucket,
  })
}
