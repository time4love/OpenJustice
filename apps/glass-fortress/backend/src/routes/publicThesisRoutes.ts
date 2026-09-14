import { Router, type Request, type Response } from 'express';
import { pageOf, publishedEntries, versionPage } from '../services/publishedThesis';

// ---------------------------------------------------------------------------
// THE THREE PUBLIC THESIS READS — docs/gf-thesis-flows.md A5 :1559–:1570, T5 :804–:853, T6 :914–:918; thesis step 23.
//
// PUBLIC AND IDENTITY-FREE (A4 :1420; A5 :1561): no `identifyResearcher`, no researcher context, no bearer read — the
// same bytes for everyone, so no answer can tell a researcher's view from the public's. The bodies are
// `services/publishedThesis.ts`'; this module only maps a body, or its absence, onto HTTP.
//
// ONE 404 BODY for a thesis that does not exist and one never published (A5 :1569): a different answer would tell an
// anonymous caller which ids are drafts (evidence §5). A withdrawn thesis is a 200 notice, never a 404 (T6 :914).
// ---------------------------------------------------------------------------

export const publicThesisRouter = Router();

const NOT_FOUND = { error: 'Not found' } as const;

publicThesisRouter.get('/', async (_req: Request, res: Response): Promise<void> => {
  res.json(await publishedEntries());
});

publicThesisRouter.get('/:id', async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  const page = await pageOf(req.params.id);
  if (page === null) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  res.json(page);
});

publicThesisRouter.get('/:id/versions/:v', async (req: Request<{ id: string; v: string }>, res: Response): Promise<void> => {
  const body = await versionPage(req.params.id, req.params.v);
  if (body === null) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  res.json(body);
});
