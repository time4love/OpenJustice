const minted: { key: string }[] = [];
/** What the bucket module answers: a link, an absent bucket, bytes already stored, or a storage failure (a throw). */
const bucketState: { value: 'signs' | 'absent' | 'stored' | 'fails' } = { value: 'signs' };
jest.mock('../src/services/documentBucket', () => ({
  mintUploadUrl: (key: string) => {
    minted.push({ key });
    if (bucketState.value === 'fails') return Promise.reject(new Error('documentBucket: could not ask whether the key exists — fetch failed'));
    if (bucketState.value === 'absent') return Promise.resolve({ absent: true });
    if (bucketState.value === 'stored') return Promise.resolve({ stored: true });
    return Promise.resolve({ uploadUrl: `https://storage.test/upload/sign/documents/${key}?token=t`, expiresAt: new Date(Date.UTC(2026, 8, 23, 14)) });
  },
}));
// THE GATE, doubled by the one fact a route test needs from it: which of its three answers it gives. The gate's own
// arms are `researcherIdentity`'s and are held where it is; what is held HERE is that the router puts it FIRST.
jest.mock('../src/middleware/researcherIdentity', () => ({
  requireResearcher: (req: { headers: Record<string, string | undefined> }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    const who = req.headers['x-test-identity'];
    if (who === 'researcher') {
      next();
      return;
    }
    if (who === 'stranger') {
      res.status(403).json({ error: 'Forbidden', message: 'No researcher account for this login. Register first.' });
      return;
    }
    res.status(401).json({ error: 'Unauthorized', message: 'Missing Authorization: Bearer <token>' });
  },
}));

import express from 'express';
import request from 'supertest';
import { TOO_LARGE_BYTES } from '../src/lib/acceptedDocumentTypes';
import { documentUploadRouter } from '../src/routes/documentUploadRoutes';

// ---------------------------------------------------------------------------
// THE UPLOAD DIALOG'S ONE ROUTE — ui A1 :1129 as ruled 2026-09-22; R76 chunk-2 prompt §1 (MEDIUM 1:
// `upsert: false`, no held arm); R78 chunk-3 prompt amendment 1.
//
// ONE POST taking `{ docId, mimeType, byteLength }` and answering ONE shape, `{ uploadUrl, expiresAt }`,
// or a refusal `{ error, code }`. It writes NO row: minting a URL is the dialog's CACHE act (thesis §2
// :126-:132), and `add_document` stays the one attributed act. The bucket module is mocked at its
// boundary; `test/documentBucket.test.ts` holds what it asks the storage for.
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());
app.use('/api/document-upload', documentUploadRouter);

const DOC_ID = '0x' + 'ab'.repeat(32);
const PDF = { docId: DOC_ID, mimeType: 'application/pdf', byteLength: 1024 };
const post = (body: unknown, who: string | null = 'researcher') => {
  const call = request(app).post('/api/document-upload').send(body as object);
  return who === null ? call : call.set('x-test-identity', who);
};

beforeEach(() => {
  minted.length = 0;
  bucketState.value = 'signs';
});

describe('the gate comes FIRST — before the body is read (ui A2 :1150-:1151)', () => {
  it('401 without a researcher — even for a body that would be refused, so nothing about the body leaks', async () => {
    const answer = await post({ nonsense: true }, null);
    expect(answer.status).toBe(401);
    expect(minted).toEqual([]);
  });

  it('403 for a signed-in caller who is not a researcher', async () => {
    const answer = await post(PDF, 'stranger');
    expect(answer.status).toBe(403);
    expect(minted).toEqual([]);
  });
});

describe('ONE answer — the signed upload URL and its expiry (ui A1 :1129; no held arm, amendment 1)', () => {
  it('a researcher’s well-formed request is answered { uploadUrl, expiresAt } for THAT docId, and nothing else', async () => {
    const answer = await post(PDF);
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({
      uploadUrl: `https://storage.test/upload/sign/documents/${DOC_ID}?token=t`,
      expiresAt: '2026-09-23T14:00:00.000Z',
    });
    expect(minted).toEqual([{ key: DOC_ID }]);
  });

  it('a file exactly at the door’s cap is signed — the cap is inclusive (A4 :1404)', async () => {
    const answer = await post({ ...PDF, byteLength: TOO_LARGE_BYTES });
    expect(answer.status).toBe(200);
  });
});

describe('THE SECOND ANSWER — { stored: true }, without minting (ui A1 :1129, §9 :998 as ruled 2026-09-23, F2)', () => {
  it('bytes already in the bucket answer 200 { stored: true } and nothing else — "already exists" is a fact, not an error', async () => {
    bucketState.value = 'stored';
    const answer = await post(PDF);
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ stored: true });
  });
});

describe('EVERY storage error is a CODE, never a bare 500 (§9 :998 as ruled 2026-09-23, F2)', () => {
  it('a storage failure the route meets answers 503 { error, code: STORAGE_UNAVAILABLE } — injected', async () => {
    bucketState.value = 'fails';
    const answer = await post(PDF);
    expect(answer.status).toBe(503);
    expect(answer.body.code).toBe('STORAGE_UNAVAILABLE');
    expect(typeof answer.body.error).toBe('string');
    // THE FLOOR: the failure really was met — the route asked the bucket.
    expect(minted).toEqual([{ key: DOC_ID }]);
  });
});

describe('the refusals, each `{ error, code }` and each before anything is minted', () => {
  it.each([
    ['a docId that is not 0x + 64 lowercase hex', { ...PDF, docId: DOC_ID.toUpperCase() }],
    ['a missing mimeType', { docId: DOC_ID, byteLength: 1 }],
    ['a byteLength that is not a whole number', { ...PDF, byteLength: 1.5 }],
    ['a negative byteLength', { ...PDF, byteLength: -1 }],
    ['a field the route does not take', { ...PDF, held: true }],
  ])('400 INVALID_BODY — %s', async (_name, body) => {
    const answer = await post(body);
    expect(answer.status).toBe(400);
    expect(answer.body.code).toBe('INVALID_BODY');
    expect(minted).toEqual([]);
  });

  it('400 UNSUPPORTED_TYPE — the door’s one accepted set, the same function add_document calls', async () => {
    const answer = await post({ ...PDF, mimeType: 'text/plain' });
    expect(answer.status).toBe(400);
    expect(answer.body.code).toBe('UNSUPPORTED_TYPE');
    expect(minted).toEqual([]);
  });

  it('413 TOO_LARGE — one byte over the door’s cap', async () => {
    const answer = await post({ ...PDF, byteLength: TOO_LARGE_BYTES + 1 });
    expect(answer.status).toBe(413);
    expect(answer.body.code).toBe('TOO_LARGE');
    expect(minted).toEqual([]);
  });

  it('503 BUCKET_ABSENT, LOUDLY — the route never creates the bucket (§12 :1185 as ruled)', async () => {
    bucketState.value = 'absent';
    const answer = await post(PDF);
    expect(answer.status).toBe(503);
    expect(answer.body.code).toBe('BUCKET_ABSENT');
    expect(typeof answer.body.error).toBe('string');
  });
});
