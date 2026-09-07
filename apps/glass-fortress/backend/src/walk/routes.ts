import { Router, type Request, type RequestHandler, type Response } from 'express';
import type { ParamsDictionary } from 'express-serve-static-core';
import type { ParsedQs } from 'qs';
import type { TrackedUrl } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireResearcher } from '../middleware/researcherIdentity';
import { captureHtml, DECODABLE_CAPTURE_SELECT, type DecodableCapture } from '../lib/captureDocument';
import { rulesInForce, trusted, type Decision, type Rule } from './derivations';
import { loadWorkListRow, snapshotDateOf, type LoadedRow } from './rows';
import { pendingStopOf } from './stop';
import { clearDraft } from './draft';
import { refusal, type Refusal } from './refusals';

// ---------------------------------------------------------------------------
// THE MARKING PAGE'S ONLY SURFACE — docs/gf-interaction-flows.md A6, built to
// test/walk/markingRoutes.test.ts. Five page-scoped routes, all behind
// requireResearcher, mounted at /api/article-rules BEFORE the legacy
// run-scoped router until step 8 (refactor plan §8):
//
//   GET    /pages/:trackedUrlId/captures/:capture           the capture to look at
//   POST   /pages/:trackedUrlId/captures/:capture/preview   PURE, on every edit
//   GET    /pages/:trackedUrlId/draft
//   PUT    /pages/:trackedUrlId/draft                       last write wins, no version
//   DELETE /pages/:trackedUrlId/draft                       the researcher's cancel
//
// THE MARKING PAGE DECIDES NOTHING AND APPLIES NOTHING. It reads a capture,
// previews selectors, and hands back a draft; approve_article_rules promotes
// the draft. Nothing here writes a decision, a rule or a row — invariants.test
// I9 holds that by scan, which is why PUT's payload is an inline literal (the
// scan reads columns from `data: { … }`) and DELETE goes through `clearDraft`,
// the one clearing payload approve, resolve and reset already share.
//
// A CAPTURE IS NAMED BY ITS PAGE AND ITS WAYBACK TIMESTAMP. Routes name the
// page by id — the marking URL carries it — and the capture by its 14 digits;
// the snapshot id appears on no route. Bytes come from the held body of a
// PENDING_JUDGEMENT row, or the UrlSnapshot's document of an ACQUIRED row and
// of a PENDING_JUDGEMENT row on a stored capture (Q7); every other outcome
// holds no bytes and is answered 409, exhaustively.
//
// REFUSALS ARE HTTP STATUSES WITH A5's `{ error, code }` BODY, never a throw:
// 401 is the middleware's, 404 the page (NOT_SURVEYED) or the row, 409 a row
// with nothing to show, 400 a malformed body (INVALID_BODY, the one code A6
// adds to A5's set). An unexpected error — a walk defect included — is not a
// refusal and reaches the server's handler.
//
// THE JSDOM BOUNDARY (plan §8): `chromeRulesetApply` is ESM-only and is
// reached by dynamic import inside the handlers that need it, never at the top
// of this module — the walk's barrel is imported by every tool test.
// ---------------------------------------------------------------------------

interface PageParams extends ParamsDictionary {
  trackedUrlId: string;
}
interface CaptureParams extends PageParams {
  capture: string;
}
interface Locals {
  page: TrackedUrl;
}

const CAPTURE = z.string().regex(/^\d{14}$/);

const previewBody = z.object({ selectors: z.array(z.string()) });

const draftBody = z.object({
  capture: CAPTURE,
  selectors: z.array(z.string()),
  trusted: z.array(z.string()),
  returned: z.boolean(),
});

/** A2's draft, as the page reads it; null when the page holds none. */
interface Draft {
  capture: string;
  selectors: string[];
  trusted: string[];
  returnedAt: Date | null;
}

function draftOf(page: TrackedUrl): Draft | null {
  if (page.draftCapture === null) return null;
  return {
    capture: page.draftCapture,
    selectors: page.draftSelectors,
    trusted: page.draftTrusted,
    returnedAt: page.draftReturnedAt,
  };
}

function refuse(res: Response, status: number, body: Refusal): void {
  res.status(status).json(body);
}

/** The refusals the capture routes share: no row is 404, a row without bytes is 409. */
const noRow = (capture: string): Refusal =>
  refusal('CAPTURE_NOT_MARKABLE', `The page has no work-list row for capture ${capture}.`);
const noBytes = (row: LoadedRow): Refusal =>
  refusal(
    'CAPTURE_NOT_MARKABLE',
    `Capture ${row.waybackTimestamp} is ${row.outcome}; only a PENDING_JUDGEMENT or an ACQUIRED capture holds bytes to show.`,
  );

/**
 * The bytes a capture holds, as the decoder reads them: the held body of a
 * PENDING_JUDGEMENT row, or the UrlSnapshot's document of an ACQUIRED row — and
 * of a PENDING_JUDGEMENT row that names a snapshot and holds no body (ruled
 * 2026-09-06, Q7): a stop on a STORED capture, the re-walk's Gate 1' on a stale
 * ACQUIRED row, keeps its snapshotId and holds nothing twice. Null for every
 * other outcome, which the caller answers 409.
 *
 * A ROW THAT CLAIMS BYTES IT DOES NOT HOLD IS A WALK DEFECT, AND A DEFECT
 * THROWS (A2: heldBody is non-null only while PENDING_JUDGEMENT; snapshotId is
 * set on ACQUIRED; the recurring ruling of steps 3–4 — never a refusal). A 409
 * here would tell the researcher the capture is unmarkable when the truth is
 * that the walk wrote a row it cannot serve.
 */
async function bytesOf(row: LoadedRow): Promise<DecodableCapture | null> {
  const t = row.waybackTimestamp;
  if (row.outcome === 'PENDING_JUDGEMENT' && row.heldBody !== null) {
    return {
      document: Buffer.from(row.heldBody),
      documentContentType: row.contentType,
      documentContentEncoding: row.contentEncoding,
    };
  }
  if (row.outcome === 'PENDING_JUDGEMENT' || row.outcome === 'ACQUIRED') {
    if (row.snapshotId === null) {
      throw new Error(
        row.outcome === 'ACQUIRED'
          ? `Walk defect: capture ${t} is ACQUIRED with no snapshotId.`
          : `Walk defect: capture ${t} is PENDING_JUDGEMENT with neither a heldBody nor a snapshotId.`,
      );
    }
    const snapshot = await prisma.urlSnapshot.findUnique({ where: { id: row.snapshotId }, select: DECODABLE_CAPTURE_SELECT });
    if (snapshot === null) throw new Error(`Walk defect: capture ${t} names snapshot ${row.snapshotId}, which does not exist.`);
    return snapshot;
  }
  return null;
}

/** The row and its bytes, or the refusal already sent. */
async function markableCapture(
  req: Request<CaptureParams>,
  res: Response<unknown, Locals>,
): Promise<{ row: LoadedRow; bytes: DecodableCapture } | null> {
  const row = await loadWorkListRow(prisma, res.locals.page.id, req.params.capture);
  if (row === null) {
    refuse(res, 404, noRow(req.params.capture));
    return null;
  }
  const bytes = await bytesOf(row);
  if (bytes === null) {
    refuse(res, 409, noBytes(row));
    return null;
  }
  return { row, bytes };
}

// The page, loaded once per request that names one; a page with no TrackedUrl
// is not in the corpus, which is what NOT_SURVEYED says. Worded for an ID —
// routes name the page by id (A1), and A5's wording would tell the researcher
// to survey the id as a URL.
const loadPage: RequestHandler<PageParams, unknown, unknown, ParsedQs, Locals> = async (req, res, next) => {
  try {
    const page = await prisma.trackedUrl.findUnique({ where: { id: req.params.trackedUrlId } });
    if (page === null) {
      refuse(res, 404, refusal('NOT_SURVEYED', `No page with id ${req.params.trackedUrlId} is in the corpus.`));
      return;
    }
    res.locals.page = page;
    next();
  } catch (err) {
    next(err);
  }
};

export const walkArticleRulesRouter = Router();
walkArticleRulesRouter.use(requireResearcher);
walkArticleRulesRouter.use('/pages/:trackedUrlId', loadPage);

walkArticleRulesRouter.get(
  '/pages/:trackedUrlId/captures/:capture',
  async (req: Request<CaptureParams>, res: Response<unknown, Locals>): Promise<void> => {
    const capture = await markableCapture(req, res);
    if (capture === null) return;
    const { row, bytes } = capture;
    const { page } = res.locals;

    const rules: Rule[] = await prisma.rule.findMany({ where: { trackedUrlId: page.id } });
    const decisions: Decision[] = await prisma.pageDecision.findMany({
      where: { trackedUrlId: page.id },
      orderBy: { sequence: 'asc' },
    });

    // The outline is built over the DECODED document — the one the rules act
    // on — and the render is the inert one; the same string feeds both (A6).
    const { documentOutline, inertDocument } = await import('../lib/chromeRulesetApply');
    const html = captureHtml(bytes);
    const inForce = rulesInForce(rules, decisions, row.waybackTimestamp);

    res.json({
      capture: row.waybackTimestamp,
      snapshotDate: snapshotDateOf(row.waybackTimestamp),
      outcome: row.outcome,
      url: page.url,
      document: inertDocument(html),
      // The outline is handed the rules in force so each node names the rules
      // that MATCH its element (F1, 2026-09-07) — the page highlights by that.
      outline: documentOutline(html, { rules: inForce.map((rule) => ({ ruleId: rule.id, selector: rule.selector })) }),
      rulesInForce: inForce.map((rule) => ({
        ruleId: rule.id,
        selector: rule.selector,
        trusted: trusted(rule, decisions) === 'TRUSTED',
      })),
      draft: draftOf(page),
      stop: pendingStopOf(row),
    });
  },
);

// PURE: called on every edit, so it leaves nothing behind.
walkArticleRulesRouter.post(
  '/pages/:trackedUrlId/captures/:capture/preview',
  async (req: Request<CaptureParams, unknown, unknown>, res: Response<unknown, Locals>): Promise<void> => {
    const parsed = previewBody.safeParse(req.body);
    if (!parsed.success) {
      refuse(res, 400, refusal('INVALID_BODY', `The preview body is { selectors: string[] }: ${parsed.error.message}`));
      return;
    }
    const capture = await markableCapture(req, res);
    if (capture === null) return;
    const { bytes } = capture;

    const { deriveTextUnderRuleset } = await import('../lib/chromeRulesetApply');
    const derived = deriveTextUnderRuleset(bytes.document, bytes.documentContentType, bytes.documentContentEncoding, {
      selectors: parsed.data.selectors,
    });
    res.json({
      keptText: derived.text,
      removedText: derived.chrome.removedText,
      removedSegments: derived.chrome.removedSegments,
      matchCounts: derived.chrome.matchCounts,
    });
  },
);

walkArticleRulesRouter.get('/pages/:trackedUrlId/draft', (_req: Request<PageParams>, res: Response<unknown, Locals>): void => {
  res.json(draftOf(res.locals.page));
});

// Last write wins, no version: the draft is the page's working state, one per
// page, and the only thing the marking page writes. The payload is inline so
// the I9 scan reads its four columns.
walkArticleRulesRouter.put(
  '/pages/:trackedUrlId/draft',
  async (req: Request<PageParams, unknown, unknown>, res: Response<unknown, Locals>): Promise<void> => {
    const parsed = draftBody.safeParse(req.body);
    if (!parsed.success) {
      refuse(
        res,
        400,
        refusal('INVALID_BODY', `The draft body is { capture, selectors: string[], trusted: string[], returned: bool }: ${parsed.error.message}`),
      );
      return;
    }
    const { page } = res.locals;
    const row = await loadWorkListRow(prisma, page.id, parsed.data.capture);
    if (row === null) {
      refuse(res, 404, noRow(parsed.data.capture));
      return;
    }
    const draftReturnedAt = parsed.data.returned ? new Date() : null;
    const updated = await prisma.trackedUrl.update({
      where: { id: page.id },
      data: {
        draftCapture: parsed.data.capture,
        draftSelectors: parsed.data.selectors,
        draftTrusted: parsed.data.trusted,
        draftReturnedAt,
      },
    });
    res.json(draftOf(updated));
  },
);

// The researcher's cancel. The log is untouched: a draft was never a decision.
walkArticleRulesRouter.delete(
  '/pages/:trackedUrlId/draft',
  async (_req: Request<PageParams>, res: Response<unknown, Locals>): Promise<void> => {
    await clearDraft(prisma, res.locals.page.id);
    res.status(204).end();
  },
);
