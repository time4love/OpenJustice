import { Router } from 'express';
import { z } from 'zod';
import { chainStatusAt } from '../mcp/tools/checkOnChainStatus';
import { diffInputOf } from '../mcp/tools/getDiffInput';
import { corpusOf, listCorpusSchema } from '../mcp/tools/listCorpus';
import { findingsOf } from '../mcp/tools/listFindings';
import { listTrajectoriesSchema, trajectoriesOf } from '../mcp/tools/listTrajectories';
import { resolvedRecordOf } from '../mcp/tools/resolveRecord';
import { searchCorpusSchema, searchOf } from '../mcp/tools/searchCorpus';
import { booleanParam, numberParam, pageById, param, publicRoute, reader } from './toolRoute';

// ---------------------------------------------------------------------------
// THE PUBLIC CORPUS ROUTES — docs/gf-ui-flows.md §6 :207–:218 (THE CHRONOLOGY, one page, one record), :221–:223 (a
// route names a page by `trackedUrlId`); docs/gf-ui-refactor-plan.md UI-3 :245–:252; the R53 sketch §a3, §c2.
//
// A ROUTE IS A TOOL'S ANSWER. Each line hands the public door a reader and the core the tool's handler calls — no
// query, no status and no refusal is spelled here; the door maps a refusal by the one table. No caller is read: the
// corpus reads' scope is `public`, fixed by the route, and a `scope` in the query is a malformed parameter.
//
// NOT MOUNTED: `GET /api/pages/:trackedUrlId/search` (#487, the researcher's ruling) — one page is searched publicly as
// `GET /api/corpus/search?page=<trackedUrlId>`; the raw archive stays `verify_claim_text`'s, gated.
// ---------------------------------------------------------------------------

/** A page named in the query, by its id — passed on unparsed to the core's lookup. */
const PAGE = z.string().optional();

const pageOf = (id: string | undefined): ReturnType<typeof pageById> | undefined => (id === undefined ? undefined : pageById(id));

/** `list_corpus`' filters, by the tool's own shapes — shared by the public and the research door. */
export const readCorpus = reader(
  {
    since: listCorpusSchema.since,
    until: listCorpusSchema.until,
    kind: listCorpusSchema.kind,
    cited: booleanParam(listCorpusSchema.cited),
    cursor: listCorpusSchema.cursor,
    limit: numberParam(listCorpusSchema.limit),
    page: PAGE,
  },
  ({ page, ...filters }) => ({ ...filters, page: pageOf(page) }),
);

/** `list_trajectories`' filters, by the tool's own shapes. */
export const readClaims = reader(
  {
    since: listTrajectoriesSchema.since,
    until: listTrajectoriesSchema.until,
    cursor: listTrajectoriesSchema.cursor,
    limit: numberParam(listTrajectoriesSchema.limit),
    page: PAGE,
  },
  ({ page, ...filters }) => ({ ...filters, page: pageOf(page) }),
);

/** `search_corpus`' phrase and filters — a phrase absent is malformed, a blank one the core's PHRASE_REQUIRED. */
export const readSearch = reader(
  { phrase: searchCorpusSchema.phrase, since: searchCorpusSchema.since, until: searchCorpusSchema.until, page: PAGE },
  ({ page, ...filters }) => ({ ...filters, page: pageOf(page) }),
);

export const corpusRouter = Router();
corpusRouter.get('/', publicRoute(readCorpus, (input) => corpusOf({ ...input, scope: 'public' })));
corpusRouter.get('/claims', publicRoute(readClaims, (input) => trajectoriesOf({ ...input, scope: 'public' })));
corpusRouter.get('/search', publicRoute(readSearch, (input) => searchOf({ ...input, scope: 'public' })));

export const pagesRouter = Router();
pagesRouter.get('/:trackedUrlId/findings', publicRoute(reader({}, (_q, req) => pageById(param(req, 'trackedUrlId'))), findingsOf));
pagesRouter.get(
  '/:trackedUrlId/diffs/:before/:after',
  publicRoute(
    reader({}, (_q, req) => ({ ref: pageById(param(req, 'trackedUrlId')), before: param(req, 'before'), after: param(req, 'after') })),
    ({ ref, before, after }) => diffInputOf(ref, { before, after }),
  ),
);
pagesRouter.get(
  '/:trackedUrlId/trajectories',
  publicRoute(reader({}, (_q, req) => pageById(param(req, 'trackedUrlId'))), (page) => trajectoriesOf({ scope: 'public', page })),
);
pagesRouter.get(
  '/:trackedUrlId/captures/:capture/chain',
  publicRoute(
    reader({}, (_q, req) => ({ ref: pageById(param(req, 'trackedUrlId')), capture: param(req, 'capture') })),
    ({ ref, capture }) => chainStatusAt(ref, capture),
  ),
);

export const recordsRouter = Router();
recordsRouter.get('/:fileHash', publicRoute(reader({}, (_q, req) => ({ fileHash: param(req, 'fileHash') })), resolvedRecordOf));
