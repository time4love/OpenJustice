import { prisma } from '../lib/prisma';
import { provisionTitleOf } from '../lib/provisions';
import { refusal, type Refusal } from '../mcp/tools/thesisRefusals';
import { documentBlocks, type DocumentBlock } from './documentPublicRead';
import { EVER_PUBLISHED } from './evidencePredicates';
import {
  citationsByVersion,
  handleOf,
  handlesOf,
  INTAKE,
  publishedAppeals,
  requireCitations,
  type DocumentCitationBase,
  type EvidenceCitation,
  type TrajectoryCitation,
} from './publishedThesis';

// ---------------------------------------------------------------------------
// THE PUBLIC THESIS READS — GET /api/thesis/:id and /:id/versions/:v. docs/gf-thesis-flows.md T5 :804–:853, T6 :914–:918,
// A5 :1565–:1570; document flows §7 :844–:858 for a DOCUMENT citation.
//
// MOVED HERE FROM `publishedThesis.ts` AT DOCUMENT STEP 34 (the researcher's Q-A, R85). A published version citing a
// document carries §7's public block, and that block asks the CHAIN (`documentPublicRead`). `publishedThesis.ts` is
// imported by a research act (`debateState.ts`, for `handlesOf`), so a chain read there would reach the debate through
// a chain of imports (`test/researchActsReachNoChain.test.ts`). The two public CORES live here instead, and nothing but
// the route imports them; the citation resolver they call stays in `publishedThesis.ts`, off the chain.
//
// Each reads no caller, so every reader gets the same bytes. What a body carries is the researcher's approved words and
// the corpus's mechanical facts; what it never carries is a model's opinion or a working row (T5 :826–:829).
// ---------------------------------------------------------------------------

/** The notice where a withdrawn page was: the date alone — never the text, never the reason (T6 :915–:916). */
interface WithdrawnNotice {
  thesisId: string;
  withdrawn: true;
  withdrawnAt: Date;
}

/** A citation as the page lists it in the history and on a version: which record, at which pin — no content. */
interface CitationRef {
  kind: string;
  name: string;
  pin: string | null;
}

type HistoryEntry =
  | { versionId: string; contentHash: string; publishedAt: Date; citations: CitationRef[] }
  | { versionId: string; publishedAt: Date; withdrawn: true; withdrawnAt: Date };

/**
 * A DOCUMENT citation on the PUBLIC page — thesis A4 :1476's V arm (R81 QC: `verified` is VERIFIED(d), document A6 :1529)
 * "plus document §7's public fields … and reshapes nothing": the arm the working view carries, and `document`, §7's
 * block, from the ONE composer (`documentPublicRead`) that `resolve_record` answers with.
 */
export type PublicDocumentCitation = DocumentCitationBase & { verified: boolean; document: DocumentBlock };

interface ThesisPage {
  thesisId: string;
  publicInterestStatement: string | null;
  claim: string;
  provision: string | null;
  /** The provision named by its table entry (docs/gf-ui-flows.md §17 :529–:530) — the page never spells a title of its own. */
  provisionTitle: string | null;
  version: { versionId: string; text: string; contentHash: string; publishedAt: Date | null; author: string };
  citations: (EvidenceCitation | TrajectoryCitation | PublicDocumentCitation)[];
  appeals: { call: unknown[]; requests: unknown[]; intake: string };
  rationale: string;
  overObjection: boolean;
  analysisRun: boolean;
  history: HistoryEntry[];
  /** Each cited page by its id and its url — the id is what the browser composes `/corpus?page=` from (thesis A5 :1569 as amended, UI-3). */
  pages: { trackedUrlId: string; url: string }[];
}

interface VersionBody {
  thesisId: string;
  versionId: string;
  text: string;
  contentHash: string;
  publishedAt: Date;
  citations: CitationRef[];
}

/** What every public read of one thesis starts from: the thesis, its ever-published versions, its PUBLISHED attempts, its withdrawals. */
async function publicRecordOf(thesisId: string) {
  // FOUR READS, ONE WAIT. Every one of them keys on `thesisId` — the PARAMETER — so not one needs another's
  // answer, and awaiting them in turn cost the SUM of four round trips for no reason. Measured 2026-09-21 on
  // run B: 1291 + 559 + 599 + 520 ms in a strict chain, where the wall should be ~1291.
  //
  // THE EARLY RETURNS MOVE BELOW, and they are unchanged in meaning: a thesis that does not exist and a
  // thesis with no ever-published version both still answer `null`. What changes is that the three cheap
  // reads are already in flight when we find out — which costs nothing, because a thesis with no versions is
  // not the case this page is built for.
  const [thesis, versions, attempts, withdrawals] = await Promise.all([
    prisma.thesis.findUnique({
      where: { id: thesisId },
      select: { id: true, provision: true, createdById: true, publishedVersionId: true, publishedAt: true, publicInterestStatement: true },
    }),
    prisma.thesisVersion.findMany({
      where: { thesisId, ...EVER_PUBLISHED },
      select: { id: true, text: true, claim: true, contentHash: true },
    }),
    prisma.publicationAttempt.findMany({
      where: { thesisId, outcome: 'PUBLISHED' },
      select: { versionId: true, rationale: true, verdict: true, createdAt: true },
    }),
    prisma.withdrawal.findMany({ where: { thesisId }, select: { versionId: true, createdAt: true } }),
  ]);
  if (thesis === null) return null;
  if (versions.length === 0) return null;
  // SORTED IN CODE, oldest first (E10 not needed): the double's append-only tables take no `orderBy`, and one sort here
  // is the order every body below reads.
  const byTime = <R extends { createdAt: Date }>(rows: R[]): R[] => [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return { thesis, versions, attempts: byTime(attempts), withdrawals: byTime(withdrawals) };
}

/** The newest withdrawal naming `versionId` — or, with none given, the newest on the thesis. */
const newestWithdrawal = (withdrawals: readonly { versionId: string; createdAt: Date }[], versionId?: string) =>
  withdrawals.filter((w) => versionId === undefined || w.versionId === versionId).at(-1);

/** When a version was published: its PUBLISHED attempt — every ever-published version has one by EVER_PUBLISHED's definition. */
function publishedAtOf(attempts: readonly { versionId: string; createdAt: Date }[], versionId: string): Date {
  const attempt = attempts.find((a) => a.versionId === versionId);
  if (attempt === undefined) {
    throw new Error(`publishedThesis: version ${versionId} is ever published and no PUBLISHED attempt names it — a malformed read.`);
  }
  return attempt.createdAt;
}

/**
 * The citations of EVERY version named, by version id — ONE read for all of them.
 *
 * `historyOf` walks every ever-published version, and asking per version cost one query per version: a thesis
 * published five times paid five round trips for a list one `in` answers. The map has an entry for every id
 * asked for, so a version that cites nothing is an empty list rather than a missing key.
 */
async function citationRefsByVersion(versionIds: readonly string[]): Promise<Map<string, CitationRef[]>> {
  const byVersion = new Map<string, CitationRef[]>(versionIds.map((id) => [id, []]));
  if (versionIds.length === 0) return byVersion;
  const select = { versionId: true, kind: true, name: true, contentVersionHash: true } as const;
  // A SET OF ONE BY ITS KEY, as the predicates' plurals do: the same rows under the same columns, and the
  // query every single-version caller has always made.
  const only = versionIds.length === 1 ? versionIds[0] : undefined;
  const mentions =
    only === undefined
      ? await prisma.thesisMention.findMany({ where: { versionId: { in: [...versionIds] } }, select })
      : (await prisma.thesisMention.findMany({ where: { versionId: only }, select })).map((m) => ({ ...m, versionId: only }));
  for (const m of mentions) {
    byVersion.get(m.versionId)?.push({ kind: m.kind, name: m.name, pin: m.contentVersionHash });
  }
  return byVersion;
}

async function citationRefsOf(versionId: string): Promise<CitationRef[]> {
  return (await citationRefsByVersion([versionId])).get(versionId) ?? [];
}

/**
 * Route 2's body (sketch §e4), decided in order: no thesis or nothing ever published → null (404, one answer for both) ·
 * the pin null with a withdrawal on record → the notice · published → the page.
 */
async function pageOf(thesisId: string): Promise<ThesisPage | WithdrawnNotice | null> {
  const loaded = await publicRecordOf(thesisId);
  if (loaded === null) return null;
  const { thesis, versions, attempts, withdrawals } = loaded;

  const pin = thesis.publishedVersionId;
  if (pin === null) {
    const notice = newestWithdrawal(withdrawals);
    if (notice === undefined) {
      // A LOUD GUARD: the pin is nulled only by `unpublish_thesis`, which writes a Withdrawal in the same transaction.
      throw new Error(`publishedThesis: thesis ${thesis.id} was published and has no pin and no withdrawal — a malformed thesis.`);
    }
    return { thesisId: thesis.id, withdrawn: true, withdrawnAt: notice.createdAt };
  }

  const version = versions.find((v) => v.id === pin);
  // THE RATIONALE AND ITS VERDICT are the PINNED version's PUBLISHED attempt's — a refused attempt's words are working state.
  const attempt = attempts.filter((a) => a.versionId === pin).at(-1);
  if (version === undefined || attempt === undefined) {
    throw new Error(`publishedThesis: thesis ${thesis.id} is pinned at ${pin} with no PUBLISHED attempt of it — a malformed thesis.`);
  }

  // FIVE INDEPENDENT READS, AWAITED TOGETHER — and the reason is measured, not stylistic.
  //
  // `publicRecordOf` above must land first: every line below needs `thesis` and `pin`. NOTHING below needs
  // anything else below it. Awaited one after another they cost the SUM of their round trips; awaited
  // together they cost the SLOWEST.
  //
  // MEASURED 2026-09-21 on run B's thesis, before this change: 20 delegate calls, 16,246 ms of database
  // time inside a 16,258 ms wall — an overlap of TWELVE MILLISECONDS, which is to say none at all. The page
  // spent its whole life waiting for one query at a time. Deployed beside the database the same shape is
  // ~2 s; from a laptop one region away it is 16–54 s, and Next's proxy cuts the socket long before it ends.
  //
  // THE LATENCY IS NOT THE DEFECT — the SEQUENCE is. A read whose wall is the sum of its parts is fast only
  // where round trips are free, and it fails the moment they are not. `historyOf` joins them: it needs
  // `versions`, `attempts` and `withdrawals`, all of which `publicRecordOf` already returned.
  const [resolvedCitations, handles, analyses, appeals, history] = await Promise.all([
    // THE ONE RESOLVER, over this page's one version — the same call the gated read makes over two.
    citationsByVersion(thesis.id, [pin]),
    handlesOf([thesis.createdById]),
    prisma.thesisAnalysis.findMany({ where: { versionId: pin }, select: { id: true } }),
    publishedAppeals(thesis.id, pin),
    historyOf(versions, attempts, withdrawals),
  ]);
  const { call, requests } = appeals;
  const { citations } = requireCitations(resolvedCitations, pin);
  // §7's block for every document this version cites — ONE loader, plural (`documentPublicRead`); it asks the chain.
  const blocks = await documentBlocks(citations.flatMap((citation) => (citation.kind === 'DOCUMENT' ? [citation.name] : [])));

  return {
    thesisId: thesis.id,
    publicInterestStatement: thesis.publicInterestStatement,
    claim: version.claim,
    provision: thesis.provision,
    provisionTitle: provisionTitleOf(thesis.provision),
    version: { versionId: pin, text: version.text, contentHash: version.contentHash, publishedAt: thesis.publishedAt, author: handleOf(handles, thesis.createdById, thesis.id) },
    citations: publicCitations(citations, blocks, thesis.id),
    appeals: { call, requests, intake: INTAKE },
    rationale: attempt.rationale,
    overObjection: attempt.verdict === 'DISPUTES',
    analysisRun: analyses.length > 0,
    history,
    pages: resolvedCitations.pages,
  };
}

/**
 * The PUBLIC page's citations — a DOCUMENT citation completed with VERIFIED(d) and §7's block (document step 34).
 *
 * A PUBLISHED version citing a document without a block is a world no clause creates: check 18 refuses publication until
 * every `#doc_` mention has a decision (A6 :1535), a decision made before a publication is in force at it (A4 :1444 as
 * CONFORMED), and so PUBLIC(d) holds for every document the pinned version cites. It THROWS, by name — never a citation
 * dropped from the page in silence.
 */
function publicCitations(
  citations: readonly (EvidenceCitation | TrajectoryCitation | DocumentCitationBase)[],
  blocks: ReadonlyMap<string, DocumentBlock>,
  thesisId: string,
): (EvidenceCitation | TrajectoryCitation | PublicDocumentCitation)[] {
  return citations.map((citation) => {
    if (citation.kind !== 'DOCUMENT') return citation;
    const block = blocks.get(citation.name);
    if (block === undefined) {
      throw new Error(
        `publicThesisPage: the published version of ${thesisId} cites #doc_${citation.name}, which no publication opened — ` +
          'check 18 refuses publishing a #doc_ head without a decision, and a decision made before a publication is in force at it.',
      );
    }
    return { ...citation, verified: block.verification.verified, document: block };
  });
}

/** Every ever-published version, oldest first; a version NAMED BY A WITHDRAWAL keeps its dates and nothing of its content (R11). */
async function historyOf(
  versions: readonly { id: string; contentHash: string }[],
  attempts: readonly { versionId: string; createdAt: Date }[],
  withdrawals: readonly { versionId: string; createdAt: Date }[],
): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = [];
  // ONE read for every version's citations — a withdrawn entry shows none, so only the others are asked for.
  const citing = versions.filter((version) => newestWithdrawal(withdrawals, version.id) === undefined).map((version) => version.id);
  const refs = await citationRefsByVersion(citing);
  for (const version of versions) {
    const publishedAt = publishedAtOf(attempts, version.id);
    const withdrawal = newestWithdrawal(withdrawals, version.id);
    entries.push(
      withdrawal === undefined
        ? { versionId: version.id, contentHash: version.contentHash, publishedAt, citations: refs.get(version.id) ?? [] }
        : { versionId: version.id, publishedAt, withdrawn: true, withdrawnAt: withdrawal.createdAt },
    );
  }
  return entries.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
}

/**
 * Route 3's body (sketch §e4, R11), decided in order: `v` not ever published on this thesis → null (404) · the thesis
 * withdrawn now → the thesis's notice, whatever `v` · `v` named by a withdrawal → ITS notice · else the version.
 */
async function versionPage(thesisId: string, versionId: string): Promise<VersionBody | WithdrawnNotice | null> {
  const loaded = await publicRecordOf(thesisId);
  if (loaded === null) return null;
  const { thesis, versions, attempts, withdrawals } = loaded;
  const version = versions.find((v) => v.id === versionId);
  if (version === undefined) return null;

  const notice = thesis.publishedVersionId === null ? newestWithdrawal(withdrawals) : newestWithdrawal(withdrawals, versionId);
  if (notice !== undefined) return { thesisId: thesis.id, withdrawn: true, withdrawnAt: notice.createdAt };

  return {
    thesisId: thesis.id,
    versionId: version.id,
    text: version.text,
    contentHash: version.contentHash,
    publishedAt: publishedAtOf(attempts, version.id),
    citations: await citationRefsOf(version.id),
  };
}

// ---------------------------------------------------------------------------
// THE TWO PUBLIC THESIS READS AS CORES — UI-3 (the R53 sketch §0h, round 2 M2). "A thesis never published" (docs/gf-ui-
// flows.md §6's table) is `NOT_PUBLISHED`, the thesis layer's word for "nothing is published", decided HERE and nowhere
// in a route module — the adapter's one table makes it the one 404.
// ---------------------------------------------------------------------------

const neverPublished = (thesisId: string): Refusal<'NOT_PUBLISHED'> => refusal('NOT_PUBLISHED', `No published thesis ${thesisId}.`);

/** `GET /api/thesis/:id`'s core: the page, the notice, or NOT_PUBLISHED for a thesis never published. */
export async function publishedPageOf(thesisId: string): Promise<ThesisPage | WithdrawnNotice | Refusal<'NOT_PUBLISHED'>> {
  return (await pageOf(thesisId)) ?? neverPublished(thesisId);
}

/** `GET /api/thesis/:id/versions/:v`'s core: the version, its notice, or NOT_PUBLISHED. */
export async function publishedVersionOf(thesisId: string, versionId: string): Promise<VersionBody | WithdrawnNotice | Refusal<'NOT_PUBLISHED'>> {
  return (await versionPage(thesisId, versionId)) ?? neverPublished(thesisId);
}
