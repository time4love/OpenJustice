import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// THE RESEARCHER'S BUCKET — docs/gf-document-flows.md §12 :1185, as ruled 2026-09-22 and
// 2026-09-23: ONE PRIVATE BUCKET per environment, in the same Supabase project as that
// environment's database, objects keyed by DOC_ID, NO PUBLIC READ; it COMES TO EXIST BY A
// MIGRATION and this module NEVER CREATES IT.
//
// THE ONE MODULE THAT HOLDS THE STORAGE CLIENT. Every other module reaches the bucket through
// these functions, so the key's spelling, the bucket's name and the refusal on an absent
// bucket each have one home — and a test doubles the bucket by mocking this module alone.
//
// NO NEW CREDENTIAL. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` already exist, and
// `lib/appEnv.ts` already ties `SUPABASE_URL` to `DATABASE_URL`'s project — so the bucket this
// reaches IS the environment's own, on the axis `assertOperationalContext` checks.
//
// THE KEY IS THE DOC_ID STRING exactly as `lib/documentIdentity`'s `docId()` prints it — `0x` +
// 64 lowercase hex — which is also what `Document.bytes` holds (A2 :1267). One spelling of the
// key, in the column and in the bucket.
//
// THE SIGNED UPLOAD URL IS ALWAYS MINTED `upsert: false` (R76 chunk-2 prompt MEDIUM 1): an object once
// written is never replaced, so HELD bytes cannot change under their name (A2 :1276) — a URL lives two
// hours and fixes `upsert` at mint, so no check made at mint could protect bytes written later. The sweep's
// list and removal live here too (`services/sweepUnclaimedObjects.ts` is their one caller).
// ---------------------------------------------------------------------------

/** The bucket's id, as the migration inserts it into `storage.buckets`. A constant: each environment is its own project. */
export const DOCUMENTS_BUCKET = 'documents';

/** How long a signed DOWNLOAD link lives — an operational parameter (interaction A8's kind). */
export const DOWNLOAD_LINK_SECONDS = 600;

/** What the bucket says about an object: its size, and when it was written. */
export interface ObjectStat {
  size: number;
  createdAt: Date;
}

/**
 * How long a signed UPLOAD link lives — storage's own two hours, which `createSignedUploadUrl` does not let a
 * caller change (`@supabase/storage-js` index.d.cts :951). Stated so the dialog can say when its link lapses.
 */
export const UPLOAD_LINK_SECONDS = 7200;

function storage() {
  const { SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey } = process.env;
  if (url === undefined || url === '' || serviceRoleKey === undefined || serviceRoleKey === '') {
    throw new Error('documentBucket: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to reach the bucket');
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } }).storage;
}

function bucket() {
  return storage().from(DOCUMENTS_BUCKET);
}

/**
 * Storage's OWN answer for a bucket that does not exist: "Bucket not found", carried as `statusCode '404'`
 * on a 400 response (storage-api's error shape). Only that answer is absence; an unreachable storage is not.
 */
function isBucketNotFound(error: unknown): boolean {
  const { statusCode, status } = error as { statusCode?: unknown; status?: unknown };
  return statusCode === '404' || status === 404;
}

/**
 * The object's size and creation moment, or NULL when no object is stored under `key`.
 *
 * ABSENCE IS AN ANSWER, EVERY OTHER FAILURE THROWS. "Nothing was uploaded under this key" is
 * what `NO_BYTES` reports (A4 :1404); an unreachable storage service is not that, and a
 * refusal saying it was would tell the researcher to upload again a file that is there.
 */
export async function statObject(key: string): Promise<ObjectStat | null> {
  const storage = bucket();
  const exists = await storage.exists(key);
  if (exists.error !== null) throw new Error(`documentBucket: could not ask whether ${key} exists — ${exists.error.message}`);
  if (!exists.data) return null;
  const info = await storage.info(key);
  if (info.error !== null) throw new Error(`documentBucket: could not read ${key}'s metadata — ${info.error.message}`);
  const size = info.data.size;
  if (size === undefined) throw new Error(`documentBucket: the bucket reported no size for ${key}`);
  return { size, createdAt: new Date(info.data.createdAt) };
}

/** The object's bytes, or NULL when no object is stored under `key`. Every other failure throws (above). */
export async function readObject(key: string): Promise<Uint8Array | null> {
  if ((await statObject(key)) === null) return null;
  const { data, error } = await bucket().download(key);
  if (error !== null) throw new Error(`documentBucket: could not download ${key} — ${error.message}`);
  return new Uint8Array(await data.arrayBuffer());
}

/**
 * A short-lived signed DOWNLOAD link — how `read_document` hands a bytes-only document that is
 * not an image, so the bytes never enter the model's context (A4 :1425 as ruled 2026-09-23).
 */
export async function mintDownloadUrl(key: string): Promise<{ url: string; expiresAt: Date }> {
  const { data, error } = await bucket().createSignedUrl(key, DOWNLOAD_LINK_SECONDS);
  if (error !== null) throw new Error(`documentBucket: could not sign a download link for ${key} — ${error.message}`);
  return { url: data.signedUrl, expiresAt: new Date(Date.now() + DOWNLOAD_LINK_SECONDS * 1000) };
}

/**
 * A signed UPLOAD link for `key`, or `{ absent: true }` when the bucket does not exist.
 *
 * THE BUCKET IS NEVER CREATED HERE (§12 :1185 as ruled 2026-09-23): it comes to exist by its migration, so an
 * absent bucket is a refusal the route answers LOUDLY — `BUCKET_ABSENT` — and never a reason to make one. Any
 * other failure to read the bucket THROWS: an outage reported as "no bucket" would be a false statement about
 * the environment.
 */
export async function mintUploadUrl(key: string): Promise<{ uploadUrl: string; expiresAt: Date } | { absent: true }> {
  const client = storage();
  const found = await client.getBucket(DOCUMENTS_BUCKET);
  if (found.error !== null) {
    if (isBucketNotFound(found.error)) return { absent: true };
    throw new Error(`documentBucket: could not read the bucket ${DOCUMENTS_BUCKET} — ${found.error.message}`);
  }
  const { data, error } = await client.from(DOCUMENTS_BUCKET).createSignedUploadUrl(key, { upsert: false });
  if (error !== null) throw new Error(`documentBucket: could not sign an upload link for ${key} — ${error.message}`);
  return { uploadUrl: data.signedUrl, expiresAt: new Date(Date.now() + UPLOAD_LINK_SECONDS * 1000) };
}

/** How many objects one `list` call asks for — the storage API pages, and this reads every page. */
const LIST_PAGE = 1000;

/**
 * EVERY object in the bucket, with its size and when it was written — the sweep's input. Every page is read, and
 * a failure THROWS: a partial list would report objects as absent that are there.
 */
export async function listObjects(): Promise<{ key: string; size: number; createdAt: Date }[]> {
  const all: { key: string; size: number; createdAt: Date }[] = [];
  for (let offset = 0; ; offset += LIST_PAGE) {
    const { data, error } = await bucket().list('', { limit: LIST_PAGE, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error !== null) throw new Error(`documentBucket: could not list the bucket ${DOCUMENTS_BUCKET} — ${error.message}`);
    for (const object of data) {
      const size = (object.metadata as { size?: unknown } | null)?.size;
      // A null moment is a FOLDER placeholder, and this bucket has none — every key is a bare DOC_ID.
      if (typeof size !== 'number' || object.created_at === null) {
        throw new Error(`documentBucket: ${object.name} is not an object of this bucket's shape (no size or no moment)`);
      }
      all.push({ key: object.name, size, createdAt: new Date(object.created_at) });
    }
    if (data.length < LIST_PAGE) return all;
  }
}

/** Remove ONE object — called by the sweep alone, after it re-read that no Document names the key. */
export async function removeObject(key: string): Promise<void> {
  const { error } = await bucket().remove([key]);
  if (error !== null) throw new Error(`documentBucket: could not remove ${key} — ${error.message}`);
}
