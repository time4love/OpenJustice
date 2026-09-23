const objects = new Map<string, { bytes: Uint8Array; createdAt: string }>();
const failures: { exists: boolean; info: boolean } = { exists: false, info: false };
const fromCalls: string[] = [];
/** The bucket as storage answers `getBucket`: present, absent (storage's own "Bucket not found"), or unreachable. */
const bucketAnswer: { value: 'present' | 'absent' | 'down' } = { value: 'present' };
const uploadMints: { key: string; options: unknown }[] = [];
/** The bucket's listing, as storage pages it — `list(prefix, { limit, offset })`. */
const listing: { name: string; created_at: string | null; metadata: { size?: number } | null }[] = [];
const listCalls: number[] = [];
const removed: string[] = [];
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      getBucket: (id: string) => {
        if (bucketAnswer.value === 'present') return Promise.resolve({ data: { id, public: false }, error: null });
        if (bucketAnswer.value === 'absent') {
          return Promise.resolve({ data: null, error: Object.assign(new Error('Bucket not found'), { status: 400, statusCode: '404' }) });
        }
        return Promise.resolve({ data: null, error: Object.assign(new Error('fetch failed'), { status: 0, statusCode: '' }) });
      },
      from: (bucket: string) => {
        fromCalls.push(bucket);
        return {
          exists: (key: string) =>
            Promise.resolve(failures.exists ? { data: null, error: new Error('storage down') } : { data: objects.has(key), error: null }),
          info: (key: string) => {
            const object = objects.get(key);
            if (failures.info || object === undefined) return Promise.resolve({ data: null, error: new Error('no info') });
            return Promise.resolve({ data: { size: object.bytes.length, createdAt: object.createdAt }, error: null });
          },
          download: (key: string) => {
            const object = objects.get(key);
            return Promise.resolve(object === undefined ? { data: null, error: new Error('missing') } : { data: new Blob([new Uint8Array(object.bytes)]), error: null });
          },
          list: (_prefix: string, options: { limit: number; offset: number }) => {
            listCalls.push(options.offset);
            const page = listing.slice(options.offset, options.offset + options.limit);
            return Promise.resolve({ data: page, error: null });
          },
          remove: (keys: string[]) => {
            removed.push(...keys);
            return Promise.resolve({ data: [], error: null });
          },
          createSignedUploadUrl: (key: string, options?: unknown) => {
            uploadMints.push({ key, options });
            return Promise.resolve({ data: { signedUrl: `https://storage.test/upload/sign/${key}?token=t`, token: 't', path: key }, error: null });
          },
          createSignedUrl: (key: string, seconds: number) =>
            Promise.resolve({ data: { signedUrl: `https://storage.test/sign/${key}?t=${String(seconds)}` }, error: null }),
        };
      },
    },
  }),
}));

import { DOCUMENTS_BUCKET, DOWNLOAD_LINK_SECONDS, listObjects, mintDownloadUrl, mintUploadUrl, readObject, removeObject, statObject, UPLOAD_LINK_SECONDS } from '../src/services/documentBucket';

// ---------------------------------------------------------------------------
// THE RESEARCHER'S BUCKET — `services/documentBucket.ts` (document step 30, flows §12 :1185 as
// ruled). The storage client is mocked AT ITS BOUNDARY (`@supabase/supabase-js`); what is held is
// this module's own contract: ABSENCE is an answer (null), every other failure THROWS — because a
// storage outage reported as "nothing is there" would send a researcher to upload again a file
// that is there.
// ---------------------------------------------------------------------------

const KEY = '0x' + 'ab'.repeat(32);

beforeAll(() => {
  process.env['SUPABASE_URL'] = 'https://project.supabase.test';
  process.env['SUPABASE_SERVICE_ROLE_KEY'] = 'service-role-for-tests';
});

beforeEach(() => {
  objects.clear();
  failures.exists = false;
  failures.info = false;
  fromCalls.length = 0;
  bucketAnswer.value = 'present';
  uploadMints.length = 0;
  listing.length = 0;
  listCalls.length = 0;
  removed.length = 0;
});

describe('the one bucket, by its constant name', () => {
  it('every call reaches the `documents` bucket — the migration’s id, one per environment', async () => {
    await statObject(KEY);
    expect(DOCUMENTS_BUCKET).toBe('documents');
    expect(fromCalls).toEqual(['documents']);
  });
});

describe('ABSENCE IS AN ANSWER; every other failure THROWS', () => {
  it('no object under the key → null, not a throw', async () => {
    expect(await statObject(KEY)).toBeNull();
    expect(await readObject(KEY)).toBeNull();
  });

  it('an object → its size and when it was written', async () => {
    objects.set(KEY, { bytes: new Uint8Array([1, 2, 3]), createdAt: '2026-09-23T10:00:00.000Z' });
    expect(await statObject(KEY)).toEqual({ size: 3, createdAt: new Date('2026-09-23T10:00:00.000Z') });
    expect(await readObject(KEY)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('a storage outage THROWS — never reported as "nothing is there"', async () => {
    failures.exists = true;
    await expect(statObject(KEY)).rejects.toThrow(/could not ask whether/);
  });

  it('metadata that cannot be read THROWS, for an object that exists', async () => {
    objects.set(KEY, { bytes: new Uint8Array([1]), createdAt: '2026-09-23T10:00:00.000Z' });
    failures.info = true;
    await expect(statObject(KEY)).rejects.toThrow(/metadata/);
  });
});

describe('the DOWNLOAD link — how a bytes-only document reaches the model (A4 :1425 as ruled)', () => {
  it('is signed for the stated lifetime, with its expiry', async () => {
    const before = Date.now();
    const link = await mintDownloadUrl(KEY);
    expect(link.url).toContain(`t=${String(DOWNLOAD_LINK_SECONDS)}`);
    expect(link.expiresAt.getTime()).toBeGreaterThanOrEqual(before + DOWNLOAD_LINK_SECONDS * 1000);
  });
});

describe('the UPLOAD link — minted `upsert: false`, EVERY time (R76 chunk-2 prompt MEDIUM 1; flows A2 :1276)', () => {
  // A signed upload URL lives two hours and fixes `upsert` AT MINT (`@supabase/storage-js` index.d.cts
  // :951, :956). Minted with upsert, a URL issued before `add_document` runs could replace the object for
  // two hours AFTER a Document row names it — HELD bytes changing under their name. With `upsert: false`
  // an object once written is never replaced, and no mint-time check has to guess the future.

  it('asks the storage for a signed upload URL under THE KEY, with upsert: false', async () => {
    const link = await mintUploadUrl(KEY);
    expect(uploadMints).toEqual([{ key: KEY, options: { upsert: false } }]);
    expect(link).toEqual({ uploadUrl: `https://storage.test/upload/sign/${KEY}?token=t`, expiresAt: expect.any(Date) as Date });
  });

  it('states its expiry as storage’s own two hours', async () => {
    const before = Date.now();
    const link = await mintUploadUrl(KEY);
    expect(UPLOAD_LINK_SECONDS).toBe(2 * 60 * 60);
    if ('absent' in link) throw new Error('the bucket is present in this world');
    expect(link.expiresAt.getTime()).toBeGreaterThanOrEqual(before + UPLOAD_LINK_SECONDS * 1000);
  });

  it('an ABSENT bucket is answered { absent: true } and NOTHING is minted — it never creates one (§12 :1185)', async () => {
    bucketAnswer.value = 'absent';
    expect(await mintUploadUrl(KEY)).toEqual({ absent: true });
    expect(uploadMints).toEqual([]);
  });

  it('a storage that cannot be REACHED throws — an outage is never reported as "no bucket"', async () => {
    bucketAnswer.value = 'down';
    await expect(mintUploadUrl(KEY)).rejects.toThrow(/could not read the bucket/);
    expect(uploadMints).toEqual([]);
  });
});

describe('the sweep’s two storage calls — here, the one storage module (R78 chunk-4 prompt §5)', () => {
  it('LISTS EVERY PAGE — 1,001 objects are two pages, and all 1,001 come back with size and moment', async () => {
    for (let i = 0; i < 1001; i += 1) listing.push({ name: `0x${i.toString(16).padStart(64, '0')}`, created_at: '2026-09-01T00:00:00.000Z', metadata: { size: i } });
    const objects = await listObjects();
    expect(listCalls).toEqual([0, 1000]);
    expect(objects).toHaveLength(1001);
    expect(objects.at(1000)).toEqual({ key: `0x${(1000).toString(16).padStart(64, '0')}`, size: 1000, createdAt: new Date('2026-09-01T00:00:00.000Z') });
  });

  it('an entry with no size or no moment is not this bucket’s shape — it THROWS, never a silently shorter list', async () => {
    listing.push({ name: 'folder', created_at: null, metadata: null });
    await expect(listObjects()).rejects.toThrow(/not an object of this bucket/);
  });

  it('removes exactly the one key it is given', async () => {
    await removeObject(KEY);
    expect(removed).toEqual([KEY]);
  });
});
