import { Router, type Request, type Response } from 'express';
import { signedTextQueryOf } from '../lib/documentTextLink';
import { serveDocumentBytes } from '../services/documentBytesServe';
import { serveDocumentContent } from '../services/documentContentServe';

// ---------------------------------------------------------------------------
// THE TWO PUBLIC SERVES — docs/gf-document-flows.md A5 :1504–:1511 as ruled 2026-09-24; ui A1 :1129 reserves the
// `/api/documents/…` prefix for them AND the SIGNED TEXT ARM of the first, built at #579: `read_document`'s `textUrl`, a
// read delivered by a link, not a dialog's route. Document step 34 builds both public branches.
//
// NO GATE, AND NO CALLER IDENTITY READ: the signed arm's signature proves the mint, and the public branches are public.
// Mounted at `/api/documents` under the general limiter, beside the other public reads (`server.ts`). On staging the
// staging gate lets a VALID signed text read through and nothing else here (`middleware/stagingAccess.ts`).
//
// `/content` answers the version's computed text as `text/plain; charset=utf-8`, byte for byte, or — where the content IS
// the bytes — the bytes under their own type. `/bytes` answers the FILE as an ATTACHMENT, with `X-Document-Id` and
// `X-Document-Salt` beside it and both EXPOSED to a browser (the researcher's Q6, R84). A refusal is `{ error, code }` at
// 404 — the public branches say nothing about which documents are held.
//
// USER BYTES CARRY THE PLATFORM'S OWN POLICY (R85 chunk 4b, recorded): every answer here is `nosniff` and sandboxed with
// no source allowed, so bytes a researcher uploaded — an `image/svg+xml` is accepted at the door — can never run as a
// page on this origin.
// ---------------------------------------------------------------------------

const router = Router();

/** The policy every document answer carries — no content sniffing, no script, no subresource, a sandboxed origin. */
function asUserBytes(res: Response): void {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
}

router.get('/:commitment/content', async (req: Request<{ commitment: string }>, res: Response): Promise<void> => {
  const answer = await serveDocumentContent(signedTextQueryOf(req.params.commitment, req.query));
  if ('code' in answer) {
    res.status(404).json(answer);
    return;
  }
  asUserBytes(res);
  if ('text' in answer) {
    res.type('text/plain; charset=utf-8').send(answer.text);
    return;
  }
  res.type(answer.mimeType).send(Buffer.from(answer.bytes));
});

router.get('/:commitment/bytes', async (req: Request<{ commitment: string }>, res: Response): Promise<void> => {
  const answer = await serveDocumentBytes(req.params.commitment);
  if ('code' in answer) {
    res.status(404).json(answer);
    return;
  }
  asUserBytes(res);
  res.set({
    'X-Document-Id': answer.docId,
    'X-Document-Salt': answer.salt,
    'Access-Control-Expose-Headers': 'X-Document-Id, X-Document-Salt',
  });
  res.attachment();
  res.type(answer.mimeType).send(Buffer.from(answer.bytes));
});

export const documentContentRouter = router;
