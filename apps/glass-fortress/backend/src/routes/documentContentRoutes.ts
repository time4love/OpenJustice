import { Router, type Request, type Response } from 'express';
import { signedTextQueryOf } from '../lib/documentTextLink';
import { serveDocumentContent } from '../services/documentContentServe';

// ---------------------------------------------------------------------------
// THE CONTENT SERVE — docs/gf-document-flows.md A5 :1504-:1506 as ruled 2026-09-24; ui A1 :1129 reserves the
// `/api/documents/…` prefix for step 34's two PUBLIC serves AND this SIGNED TEXT ARM of the first, built at #579:
// `read_document`'s `textUrl`, a read delivered by a link, not a dialog's route.
//
// NO GATE, AND NO CALLER IDENTITY READ: the signed arm's signature proves the mint, and the public branch is public.
// Mounted at `/api/documents` under the general limiter, beside the other public reads (`server.ts`). On staging the
// staging gate lets a VALID signed text read through and nothing else here (`middleware/stagingAccess.ts`).
//
// The text is served as `text/plain; charset=utf-8`, the version's computed text byte for byte; a refusal is
// `{ error, code }` at 404 — the public branch says nothing about which documents are held.
// ---------------------------------------------------------------------------

const router = Router();

router.get('/:commitment/content', async (req: Request<{ commitment: string }>, res: Response): Promise<void> => {
  const answer = await serveDocumentContent(signedTextQueryOf(req.params.commitment, req.query));
  if ('code' in answer) {
    res.status(404).json(answer);
    return;
  }
  res.type('text/plain; charset=utf-8').send(answer.text);
});

export const documentContentRouter = router;
