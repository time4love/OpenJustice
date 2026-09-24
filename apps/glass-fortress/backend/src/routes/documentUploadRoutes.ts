import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { isAccepted, TOO_LARGE_BYTES } from '../lib/acceptedDocumentTypes';
import { requireResearcher } from '../middleware/researcherIdentity';
import { mintUploadUrl } from '../services/documentBucket';
import { documentRefusal, type DocumentRefusal, type DocumentUploadCode } from '../services/documentRefusals';

// ---------------------------------------------------------------------------
// THE UPLOAD DIALOG'S ONE ROUTE — docs/gf-ui-flows.md A1 :1129 as ruled 2026-09-22; document flows §9
// :998 and §12 :1185 as ruled 2026-09-23; document refactor plan step 30 :182.
//
// THE SECOND DIALOG OF ITS CLASS, beside the marking page: its own router, `requireResearcher` INSIDE
// it (the marking router's shape, `walk/routes.ts` :141), mounted beside `/api/article-rules` and never
// under the read view's prefix, whose routes are each a tool's answer (ui §7) — a dialog's route never was.
//
// ONE POST, TWO ANSWERS. `{ docId, mimeType, byteLength }` in; `{ uploadUrl, expiresAt }` out — or `{ stored:
// true }`, WITHOUT minting, when the bucket already holds the object for that docId (§9 :998 and ui A1 :1129 as
// ruled 2026-09-23, F2 rule (ii), superseding R78 chunk-3 amendment 1's "no held arm": storage refuses to SIGN a key
// that holds an object, so the second send of one file met a bare 500 and never reached the upload) — or a refusal
// `{ error, code }`. Every link is still minted `upsert: false`, so an object once written is never replaced.
//
// EVERY STORAGE ERROR IS A CODE, NEVER A BARE 500 (same ruling): any failure `documentBucket` throws is answered 503
// `STORAGE_UNAVAILABLE`, which the dialog names; the cause is logged here, never sent.
//
// MINTING IS THE DIALOG'S CACHE ACT (thesis §2 :126-:132), as the marking page's `PUT …/draft` is
// (interaction :548). IT WRITES NO ROW: this module imports no database client, and `add_document` stays
// the one attributed act, reading the object by `docId` and refusing NAME_MISMATCH if the bytes are wrong.
//
// THE TOLD SIZE ONLY SAVES A DOOMED UPLOAD. What binds is the bucket's `file_size_limit` (the migration)
// and `add_document`'s read of the OBJECT'S OWN size (A4 :1404); a caller who lies here meets both.
//
// THE LOCAL NAME IS `router` ON PURPOSE: `test/writeAuthorization.test.ts` reads `router.<verb>(` and
// `router.use(<gate>)` in every file under `routes/`, and a router named otherwise would be invisible to it.
// ---------------------------------------------------------------------------

/** A DOC_ID as `docId()` prints it — `0x` + 64 lowercase hex (A1 :1244). The object key, one spelling. */
const DOC_ID = /^0x[0-9a-f]{64}$/;

const uploadBody = z
  .object({
    docId: z.string().regex(DOC_ID),
    mimeType: z.string().min(1),
    byteLength: z.number().int().nonnegative(),
  })
  .strict();

function refuse(res: Response, status: number, body: DocumentRefusal<DocumentUploadCode>): void {
  res.status(status).json(body);
}

const router = Router();
router.use(requireResearcher);

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = uploadBody.safeParse(req.body);
  if (!parsed.success) {
    refuse(res, 400, documentRefusal('INVALID_BODY', `The body is { docId: 0x + 64 hex, mimeType, byteLength: a whole number }: ${parsed.error.message}`));
    return;
  }
  const { docId, mimeType, byteLength } = parsed.data;
  if (!isAccepted(mimeType)) {
    refuse(res, 400, documentRefusal('UNSUPPORTED_TYPE', `The door accepts PDF, XLSX, CSV, image, audio and video — not "${mimeType}".`));
    return;
  }
  if (byteLength > TOO_LARGE_BYTES) {
    refuse(res, 413, documentRefusal('TOO_LARGE', `The file is ${String(byteLength)} bytes; the door takes at most ${String(TOO_LARGE_BYTES)} (50 MB).`));
    return;
  }
  let minted: Awaited<ReturnType<typeof mintUploadUrl>>;
  try {
    minted = await mintUploadUrl(docId);
  } catch (cause) {
    console.error('document-upload: storage failed', cause);
    refuse(res, 503, documentRefusal('STORAGE_UNAVAILABLE', 'The storage did not answer, and nothing was signed. Try again.'));
    return;
  }
  if ('absent' in minted) {
    refuse(res, 503, documentRefusal('BUCKET_ABSENT', 'The documents bucket does not exist in this environment — it is created by its migration, and nothing here creates it.'));
    return;
  }
  if ('stored' in minted) {
    res.json({ stored: true });
    return;
  }
  res.json({ uploadUrl: minted.uploadUrl, expiresAt: minted.expiresAt.toISOString() });
});

export const documentUploadRouter = router;
