import { Router } from 'express';
import { z } from 'zod';
import { debateOf } from '../mcp/tools/getDebate';
import { framingOf } from '../mcp/tools/getFraming';
import { getThesisContextSchema, thesisContextOf } from '../mcp/tools/getThesisContext';
import { corpusOf } from '../mcp/tools/listCorpus';
import { evidenceReviewsOf } from '../mcp/tools/listEvidenceReviews';
import { framingsOf } from '../mcp/tools/listFramings';
import { pagesOf } from '../mcp/tools/listPages';
import { thesesListOf } from '../mcp/tools/listTheses';
import { thesisReviewsOf } from '../mcp/tools/listThesisReviews';
import { trajectoriesOf } from '../mcp/tools/listTrajectories';
import { searchOf } from '../mcp/tools/searchCorpus';
import { articleRulesOf } from '../walk/tools/getArticleRules';
import { ruleHistoryOf } from '../walk/tools/getRuleHistory';
import { capturesOf } from '../walk/tools/listCaptures';
import { readClaims, readCorpus, readSearch } from './corpusRoutes';
import { pageById, param, reader, researchRoute } from './toolRoute';

// ---------------------------------------------------------------------------
// THE RESEARCHER'S READ VIEW — docs/gf-ui-flows.md §7 :278–:310, §7.1 :312–:327; docs/gf-ui-refactor-plan.md UI-3
// :253–:260; the R53 sketch §a3, §c3.
//
// FOURTEEN GATED READS, and not one gate among them: `server.ts` mounts this router as `app.use('/api/research',
// requireResearcher, researchRouter)`, so 401 and 403 come before any route here runs, and the gated door places the
// researcher the gate admitted in context for the core. No route reads a caller or filters by one; `scope` is `all`,
// fixed by the route (plan :256), and a `scope` in the query is a malformed parameter. A refusal inside the prefix is
// the tool's own `{ error, code }` (§7 :308–:310). The document plan's three reads are RESERVED and not mounted (§7 :304).
// ---------------------------------------------------------------------------

export const researchRouter = Router();

const nothing = reader({}, () => ({}));
const pageNamed = reader({}, (_q, req) => pageById(param(req, 'trackedUrlId')));

researchRouter.get('/reviews', researchRoute(nothing, () => thesisReviewsOf({ scope: 'all' })));
researchRouter.get('/evidence-reviews', researchRoute(nothing, () => evidenceReviewsOf()));
researchRouter.get('/theses', researchRoute(nothing, () => thesesListOf({ scope: 'all' })));
researchRouter.get(
  '/theses/:id',
  researchRoute(
    reader({ since: getThesisContextSchema.since }, ({ since }, req) => ({ thesisId: param(req, 'id'), since })),
    thesisContextOf,
  ),
);
researchRouter.get('/framings', researchRoute(nothing, () => framingsOf()));
researchRouter.get('/framings/:id', researchRoute(reader({}, (_q, req) => ({ framingId: param(req, 'id') })), framingOf));
researchRouter.get('/debates/:sessionId', researchRoute(reader({}, (_q, req) => ({ sessionId: param(req, 'sessionId') })), debateOf));
researchRouter.get('/corpus', researchRoute(readCorpus, (input) => corpusOf({ ...input, scope: 'all' })));
researchRouter.get('/corpus/claims', researchRoute(readClaims, (input) => trajectoriesOf({ ...input, scope: 'all' })));
researchRouter.get('/corpus/search', researchRoute(readSearch, (input) => searchOf({ ...input, scope: 'all' })));
researchRouter.get('/pages', researchRoute(nothing, () => pagesOf()));
researchRouter.get(
  '/pages/:trackedUrlId/captures',
  researchRoute(
    reader({ outcome: z.string().optional() }, ({ outcome }, req) => ({ ref: pageById(param(req, 'trackedUrlId')), outcome })),
    ({ ref, outcome }) => capturesOf(ref, outcome),
  ),
);
researchRouter.get('/pages/:trackedUrlId/rules', researchRoute(pageNamed, articleRulesOf));
researchRouter.get(
  '/pages/:trackedUrlId/rules/:ruleId/history',
  researchRoute(
    reader({}, (_q, req) => ({ ref: pageById(param(req, 'trackedUrlId')), ruleId: param(req, 'ruleId') })),
    ({ ref, ruleId }) => ruleHistoryOf(ref, { ruleId }),
  ),
);
