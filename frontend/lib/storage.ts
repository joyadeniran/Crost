// lib/storage.ts
// Supabase Storage adapter. Keeps the interface the app already used for
// artifact files: storage.from('artifacts').upload/getObject/remove/...
// All objects live in ONE private bucket (SUPABASE_STORAGE_BUCKET, default
// 'crost') under a logical-bucket prefix, e.g. crost/artifacts/<path>.
// The bucket is private: reads go through the service role after an
// ownership check (see app/api/artifacts/[id]/download). Server-side ONLY.

import { getSupabaseAdmin } from './supabase-admin'

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'crost'

export const appStorage = {
  from: (bucket: string) => {
    const key = (path: string) => `${bucket}/${path}`
    const bucketApi = () => getSupabaseAdmin().storage.from(BUCKET)

    return {
      upload: async (
        path: string,
        content: Buffer | string,
        opts: { contentType?: string; upsert?: boolean } = {}
      ) => {
        try {
          const body = typeof content === 'string' ? Buffer.from(content) : content
          const { error } = await bucketApi().upload(key(path), body, {
            contentType: opts.contentType ?? 'application/octet-stream',
            upsert: opts.upsert ?? true,
            cacheControl: '0',
          })
          if (error) return { data: null, error: new Error(error.message) }
          // Return the bucket-relative path; getPublicUrl/download/remove/copy
          // all re-prepend the logical bucket (avoids double prefixes).
          return { data: { path }, error: null }
        } catch (err) {
          return { data: null, error: err as Error }
        }
      },

      // Reference URL only — the bucket is private. Consumers extract the
      // object path after '/<bucket>/' and read it via getObject().
      getPublicUrl: (path: string) => ({
        data: {
          publicUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${key(path)}`,
        },
      }),

      getObject: async (path: string): Promise<{ data: Buffer | null; error: Error | null }> => {
        try {
          const rel = path.replace(new RegExp(`^(${bucket}/)+`), '')
          const { data, error } = await bucketApi().download(key(rel))
          if (error || !data) return { data: null, error: new Error(error?.message ?? 'not found') }
          return { data: Buffer.from(await data.arrayBuffer()), error: null }
        } catch (err) {
          return { data: null, error: err as Error }
        }
      },

      remove: async (paths: string[]) => {
        try {
          const { error } = await bucketApi().remove(paths.map(key))
          return { data: null, error: error ? new Error(error.message) : null }
        } catch (err) {
          return { data: null, error: err as Error }
        }
      },

      download: async (path: string) => {
        try {
          const { data, error } = await bucketApi().download(key(path))
          if (error || !data) return { data: null, error: new Error(error?.message ?? 'not found') }
          return { data: Buffer.from(await data.arrayBuffer()), error: null }
        } catch (err) {
          return { data: null, error: err as Error }
        }
      },

      copy: async (
        fromPath: string,
        toPathOrOpts: string | { destinationBucket: string },
        toPathFallback?: string
      ) => {
        try {
          let toBucketName = bucket
          const toPath = typeof toPathOrOpts === 'string' ? toPathOrOpts : (toPathFallback ?? fromPath)
          if (typeof toPathOrOpts === 'object' && toPathOrOpts.destinationBucket) {
            toBucketName = toPathOrOpts.destinationBucket
          }
          const { error } = await bucketApi().copy(key(fromPath), `${toBucketName}/${toPath}`)
          return { data: null, error: error ? new Error(error.message) : null }
        } catch (err) {
          return { data: null, error: err as Error }
        }
      },
    }
  },
}
