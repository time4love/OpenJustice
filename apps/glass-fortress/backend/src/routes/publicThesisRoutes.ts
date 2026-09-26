import { Router } from 'express';
import { whistleblowerCallOf } from '../mcp/tools/getWhistleblowerCall';
import { publishedPageOf, publishedVersionOf } from '../services/publicThesisPage';
import { publishedEntries } from '../services/publishedThesis';
import { param, publicRoute, reader } from './toolRoute';

// ---------------------------------------------------------------------------
// THE FOUR PUBLIC THESIS READS — docs/gf-thesis-flows.md A5 :1559–:1570, T5 :804–:853, T6 :914–:918; thesis step 23;
// docs/gf-ui-flows.md §6 :202–:206 (the call page's read, UI-3).
//
// PUBLIC AND IDENTITY-FREE (A4 :1420; A5 :1561): no `identifyResearcher`, no researcher context, no bearer read — the
// same bytes for everyone, so no answer can tell a researcher's view from the public's. Each route is its core's answer
// through the public door, which maps every status; the bodies are `services/publicThesisPage.ts`' (the two cores, moved
// there at document step 34 — R85 Q-A), `services/publishedThesis.ts`' and the tools'.
//
// ONE 404 BODY for a thesis that does not exist and one never published (A5 :1569): the core refuses NOT_PUBLISHED for
// both, and the door's table answers the one body. A withdrawn thesis is a 200 notice, never a 404 (T6 :914). The call
// refuses nothing: `{ live: false }` is a 200 for a draft and an id naming nothing alike (A4 :1501–:1504).
// ---------------------------------------------------------------------------

export const publicThesisRouter = Router();

// `list_theses`' anonymous answer IS `publishedEntries()` (listTheses.ts; thesis A5 :1564) — the function itself, never the
// tool's core, which reads a caller: this read answers the same bytes whoever is in context (`test/thesis/publicReads.test.ts`, KEEP).
publicThesisRouter.get('/', publicRoute(reader({}, () => ({})), () => publishedEntries()));
publicThesisRouter.get('/:id', publicRoute(reader({}, (_q, req) => param(req, 'id')), publishedPageOf));
publicThesisRouter.get(
  '/:id/versions/:v',
  publicRoute(reader({}, (_q, req) => ({ thesisId: param(req, 'id'), versionId: param(req, 'v') })), ({ thesisId, versionId }) =>
    publishedVersionOf(thesisId, versionId),
  ),
);
publicThesisRouter.get('/:id/call', publicRoute(reader({}, (_q, req) => ({ thesisId: param(req, 'id') })), whistleblowerCallOf));
