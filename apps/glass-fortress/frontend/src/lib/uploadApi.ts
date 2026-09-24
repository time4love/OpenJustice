import { authedFetch, authHeaders } from '@/lib/api';

// ---------------------------------------------------------------------------
// THE UPLOAD DIALOG'S TWO REQUESTS — docs/gf-ui-flows.md A1 :1129 (the route), R76 chunk-2 prompt §1 (MEDIUM 1).
//
// ONE POST to the dialog's own route, `/api/document-upload`, for a signed upload URL — or its answer that the bytes
// are ALREADY STORED, when there is nothing to send (F2); then ONE PUT of the file to that URL, straight into the
// private bucket. Minting is the dialog's CACHE act (thesis §2 :126–:132): neither
// request writes a row, and `add_document` — run in the conversation — stays the one attributed act.
//
// IMPORTED BY NOTHING UNDER `/research`. The read view never writes (`test/noWriteFromResearch.test.ts`), and a
// research page reaching this module would bring a POST into its closure.
//
// EVERY ANSWER IS A STATE, never a throw a page must catch: the gate's two statuses first (ui A2 :1150–:1151),
// then the route's refusal by its code, then whether the storage took the bytes.
// ---------------------------------------------------------------------------

export const UPLOAD_ROUTE = '/api/document-upload';

/** The route's refusal codes (`backend/src/services/documentRefusals.ts`, `DocumentUploadCode`). */
export type UploadRefusal = 'INVALID_BODY' | 'UNSUPPORTED_TYPE' | 'TOO_LARGE' | 'BUCKET_ABSENT' | 'STORAGE_UNAVAILABLE';
const REFUSALS: readonly UploadRefusal[] = ['INVALID_BODY', 'UNSUPPORTED_TYPE', 'TOO_LARGE', 'BUCKET_ABSENT', 'STORAGE_UNAVAILABLE'];

export type SignAnswer =
  | { state: 'SIGNED'; uploadUrl: string; expiresAt: string }
  /** The bucket already holds these bytes — nothing to send (§9 :998, ui A1 :1129 as ruled 2026-09-23, F2). */
  | { state: 'STORED' }
  | { state: 'SIGNED_OUT' }
  | { state: 'NOT_A_RESEARCHER' }
  | { state: 'REFUSED'; code: UploadRefusal }
  | { state: 'UNREACHABLE' };

export async function requestUploadUrl(file: { docId: string; mimeType: string; byteLength: number }): Promise<SignAnswer> {
  let response: Response;
  try {
    response = await authedFetch(UPLOAD_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(file),
    });
  } catch {
    return { state: 'UNREACHABLE' };
  }
  if (response.status === 401) return { state: 'SIGNED_OUT' };
  if (response.status === 403) return { state: 'NOT_A_RESEARCHER' };
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : undefined;
    const refusal = REFUSALS.find((known) => known === code);
    if (refusal === undefined) throw new Error(`upload route answered ${String(response.status)} with code ${JSON.stringify(code) ?? 'undefined'} — no approved state names it`);
    return { state: 'REFUSED', code: refusal };
  }
  const { uploadUrl, expiresAt, stored } = (body ?? {}) as { uploadUrl?: unknown; expiresAt?: unknown; stored?: unknown };
  if (stored === true) return { state: 'STORED' };
  if (typeof uploadUrl !== 'string' || typeof expiresAt !== 'string') throw new Error('upload route answered 200 without { uploadUrl, expiresAt }');
  return { state: 'SIGNED', uploadUrl, expiresAt };
}

/**
 * The PUT of the file to its signed URL. `EXISTS` is storage's "the resource already exists" — every URL is minted
 * `upsert: false`, so an object once written is never replaced, and the same bytes under the same name ARE uploaded
 * (MEDIUM 1). Since F2 the route answers `STORED` before any link for bytes already there, so this arm is left to a
 * race — the same file finishing in another tab between the route's answer and this PUT. Every other failure is a
 * failure: a command for bytes that are not there would be a false statement.
 */
export async function putToSignedUrl(uploadUrl: string, file: Blob, mimeType: string): Promise<'UPLOADED' | 'EXISTS' | 'FAILED'> {
  let response: Response;
  try {
    response = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': mimeType, 'x-upsert': 'false' }, body: file });
  } catch {
    return 'FAILED';
  }
  if (response.ok) return 'UPLOADED';
  const body: unknown = await response.json().catch(() => null);
  const statusCode = typeof body === 'object' && body !== null ? (body as { statusCode?: unknown }).statusCode : undefined;
  return statusCode === '409' ? 'EXISTS' : 'FAILED';
}
