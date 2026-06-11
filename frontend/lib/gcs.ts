// lib/gcs.ts
// Google Cloud Storage client — replaces Supabase Storage.
// Server-side ONLY.

import { Storage } from '@google-cloud/storage'

let _storage: Storage | null = null

function getStorage(): Storage {
  if (!_storage) {
    _storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID,
      // In Cloud Run, uses default service account. Locally, uses GOOGLE_APPLICATION_CREDENTIALS.
    })
  }
  return _storage
}

const BUCKET = process.env.GCS_BUCKET ?? 'crost-storage'

export const gcsStorage = {
  from: (bucket: string) => ({
    upload: async (
      path: string,
      content: Buffer | string,
      opts: { contentType?: string; upsert?: boolean } = {}
    ) => {
      try {
        const file = getStorage().bucket(BUCKET).file(`${bucket}/${path}`)
        await file.save(typeof content === 'string' ? Buffer.from(content) : content, {
          contentType: opts.contentType ?? 'application/octet-stream',
          resumable: false,
          metadata: { cacheControl: 'no-cache' },
        })
        // Return the bucket-relative path (matches Supabase + download/remove/copy/
        // getPublicUrl, which all re-prepend the logical bucket). Returning the
        // already-prefixed path here made getPublicUrl double it
        // (e.g. artifacts/artifacts/...).
        return { data: { path }, error: null }
      } catch (err) {
        return { data: null, error: err as Error }
      }
    },

    getPublicUrl: (path: string) => ({
      data: { publicUrl: `https://storage.googleapis.com/${BUCKET}/${bucket}/${path}` },
    }),

    // Stream object bytes via the service account (bucket is private).
    // Accepts a bucket-relative path; tolerates a redundant leading logical-bucket
    // prefix from legacy double-prefixed URLs.
    getObject: async (path: string): Promise<{ data: Buffer | null; error: Error | null }> => {
      try {
        const rel = path.replace(new RegExp(`^(${bucket}/)+`), '')
        const [content] = await getStorage().bucket(BUCKET).file(`${bucket}/${rel}`).download()
        return { data: content, error: null }
      } catch (err) {
        return { data: null, error: err as Error }
      }
    },

    remove: async (paths: string[]) => {
      try {
        await Promise.all(
          paths.map(p =>
            getStorage().bucket(BUCKET).file(`${bucket}/${p}`).delete({ ignoreNotFound: true })
          )
        )
        return { data: null, error: null }
      } catch (err) {
        return { data: null, error: err as Error }
      }
    },

    download: async (path: string) => {
      try {
        const [content] = await getStorage().bucket(BUCKET).file(`${bucket}/${path}`).download()
        return { data: content, error: null }
      } catch (err) {
        return { data: null, error: err as Error }
      }
    },

    copy: async (fromPath: string, toPathOrOpts: string | { destinationBucket: string }, toPathFallback?: string) => {
      try {
        let toBucketName = bucket
        let toPath = typeof toPathOrOpts === 'string' ? toPathOrOpts : (toPathFallback ?? fromPath)
        if (typeof toPathOrOpts === 'object' && toPathOrOpts.destinationBucket) {
          toBucketName = toPathOrOpts.destinationBucket
        }
        const from = getStorage().bucket(BUCKET).file(`${bucket}/${fromPath}`)
        const to = getStorage().bucket(BUCKET).file(`${toBucketName}/${toPath}`)
        await from.copy(to)
        return { data: null, error: null }
      } catch (err) {
        return { data: null, error: err as Error }
      }
    },
  }),
}
