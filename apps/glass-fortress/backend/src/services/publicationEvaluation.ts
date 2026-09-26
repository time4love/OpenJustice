import type { DocumentOpening } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { quotedSpans } from '../lib/thesisAssertions';
import type { Verdict } from '../lib/verdict';
import { headFingerprint, type HeadFingerprint } from './criticMaterial';
import { passagesCiting } from './debatePassage';
import { documentShedNotBuilt, documentsByCommitment, type CitedDocument } from './documentCitation';
import { verdict as documentVerdict, type Custody } from './documentPredicates';
import { checksOf, type EvidenceCheck } from './evidenceChecks';
import { NOT_ASKED, publishableEvidence, type DocumentVerification, type VersionPublishableReport } from './evidencePredicates';
import { claimFramed, currentAnalysis, gapsDecided, trajectoryCurrent, type GapEntry } from './thesisPredicates';
import { resolveTrajectoryCitations, type TrajectoryCurrency } from './trajectoryCitation';

// ---------------------------------------------------------------------------
// THE ONE EVALUATION OF PUBLISHABLE(v) — docs/gf-thesis-flows.md A3 :1390–:1396, A6 :1584–:1612; thesis step 23.
//
// ONE LOAD, EVERY CONJUNCT CALLED. `evaluatePublication` reads everything PUBLISHABLE(v) reads, once, and asks each
// conjunct of the predicate that owns it: CLAIM_FRAMED `claimFramed`, the evidence half `publishableEvidence` (ONCE —
// rows 5–10 are `checksOf` over the same report), the trajectories `resolveTrajectoryCitations` and
// `trajectoryCurrent`, FINGERPRINT the ONE loader `headFingerprint` with `currentAnalysis`, GAP_LIST as that loader
// computed it with `gapsDecided`. The publication assessor's answer is an INPUT, so nothing here asks a model.
//
// VERIFIED(d) IS AN INPUT TOO — document step 34, the researcher's Q1 (`R84-review-state.md` Entry 3). ANCHORED(d) is a
// chain read (document A3 :1366) and this module reaches no chain; `publish_thesis` and `check_publication_readiness`
// ask `documentStanding.verifiedOf` and hand the answer in as `verification`. A caller that does not ask gets its DOCUMENT
// citations NOT EVALUABLE (`evidencePredicates.DocumentVerification`), and the fold refuses a version it cannot grade.
//
// THE MAP AND THE FOLD LIVE HERE, TOGETHER (the R49 sketch §6 R9, the researcher's §9-1 (ii)): `rowsOf` renders A6's first
// seventeen rows and `publishabilityOf` folds THOSE rows, so the gate's rows and the predicate's verdict are one spelling
// read twice — never two derivations that happen to agree. `services/thesisGate.ts` maps; `thesisPredicates.
// publishableVersion` folds; each calls `evaluatePublication` once.
//
// A CALL-TIME CYCLE, DECLARED (R13): `thesisPredicates` imports this module for `publishableVersion`, and this module and
// `criticMaterial` import `thesisPredicates`' pure predicates. Every cross-module use is inside a function, so the modules
// load in either order; `test/publicationEvaluation.test.ts` holds both orders under `jest.isolateModules`. A top-level
// READ of a `thesisPredicates` export in any module on the cycle would make it a load-time cycle.
//
// IT WRITES NOTHING AND OPENS NO TRANSACTION.
// ---------------------------------------------------------------------------

/**
 * The publication assessor's answers the gate reads (A3 :1394; A6 :1599–:1601) — null when no rationale was given, so the
 * assessor was not asked. `allegationsFramed` is COINED (step 17, 7.4): check 17's advisory opinion.
 */
export interface PublicationAssessment {
  substance: boolean;
  names: readonly string[];
  allegationsFramed: boolean;
}

/** A6's ids 1–4 and 11–17 — the thesis layer's own rows; 5–10 are evidence A6's `CheckId`. */
type ThesisCheckId =
  | 'HEAD_VERSION'
  | 'CLAIM_FRAMED'
  | 'CITES_EVIDENCE'
  | 'PUBLIC_INTEREST_STATEMENT'
  | 'TRAJECTORIES_RESOLVE'
  | 'TRAJECTORIES_CURRENT'
  | 'ANALYSIS_CURRENT'
  | 'GAPS_DECIDED'
  | 'RATIONALE_SUBSTANCE'
  | 'NAMES_NO_PERSON'
  | 'ALLEGATIONS_FRAMED'
  // Document A6 :1535–:1536's two added checks, by addition after the seventeen: 18 BUILT AT DOCUMENT STEP 33 (plan :255,
  // R81 Q-2), 19 at step 34.
  | 'DOCUMENT_OPENING_DECIDED'
  | 'DOCUMENT_QUOTES_PRESENT';

/** One row of the gate — `EvidenceCheck`'s shape, so rows 5–10 are evidence's own rows, deep-equal. No binding flag. */
export type ThesisCheck =
  | EvidenceCheck
  | {
      id: ThesisCheckId;
      kind: 'hard' | 'advisory';
      verdict: 'PASS' | 'FAIL' | 'EXAMINED_NONE';
      examined: unknown[];
      failures: unknown[];
    };

/** What PUBLISHABLE(v) read, loaded once. */
export interface PublicationEvaluation {
  versionId: string;
  thesis: { id: string; headVersionId: string | null; publishedVersionId: string | null; publicInterestStatement: string | null };
  /** The `Withdrawal` rows naming this version — a withdrawn head is not publishable again (R16). */
  withdrawalIds: string[];
  framingIds: string[];
  claimFramed: boolean;
  report: VersionPublishableReport;
  /** The corpus records the version cites — its EVIDENCE and DOCUMENT names, CITES_EVIDENCE's subjects (document A6 :1534). */
  citedRecords: string[];
  trajectoryIds: string[];
  currencies: { id: string; currency: TrajectoryCurrency }[];
  missingTrajectoryIds: string[];
  headed: HeadFingerprint;
  analysisCurrent: boolean;
  list: GapEntry[];
  /**
   * Every `#doc_` citation of the version, with its custody and the opening in force for (thesis, document) — the
   * highest `sequence` (A2's append-only log) — or null where none is decided. Empty when the version cites no document,
   * and then nothing was read for it.
   */
  documents: { name: string; custody: Custody | null; opening: DocumentOpening | null }[];
  /**
   * The TITLE of every cited document — what NAMES_NO_PERSON examined of them (document A6 :1537; thesis :757 as CONFORMED,
   * R84 Q15): the assessor was handed each, and row 16 names each. Empty when the version cites no document.
   */
  titles: string[];
  /**
   * The commitment of every cited document with NO title — row 16 names each NOT EXAMINED rather than folding it into a
   * clean list (A6 :1537; LOW-m, R84 Entry 16, under Q-R2 (a), R86 Entry 3). Only a SEALED document can have none (the CHECK
   * `Document_title_required_when_held`). Empty when every cited document is titled, or none is cited.
   */
  untitled: string[];
  /**
   * Check 19's subjects — per DOCUMENT mention of the version, every quoted span of every paragraph carrying its token,
   * each with VERDICT(span, d) (document A6 :1536; A2 :1315). `mentionId` rides so `publish_thesis` writes the SAME
   * verdicts as PassageVerdict rows — derived here once, never recomputed at the write. Empty when the version cites no
   * document, and then nothing was read for it.
   */
  quotes: DocumentQuotes[];
  assessment: PublicationAssessment | null;
}

/** One DOCUMENT mention's quoted spans, each with the ONE verdict rule's answer over CURRENT(d). */
export interface DocumentQuotes {
  mentionId: string;
  name: string;
  spans: QuotedSpan[];
}

/**
 * One quoted span and VERDICT(span, d). UNCHECKED CARRIES ITS REASON (document A3 :1386, A6 :1539): the content is the
 * bytes, or CURRENT(d) is not yet derived — a reader of the row is told which. The PassageVerdict row stores the value
 * alone (A2 :1314); the reason is the readiness row's.
 */
export type QuotedSpan = { span: string; verdict: Exclude<Verdict, 'UNCHECKED'> } | { span: string; verdict: 'UNCHECKED'; reason: string };

/** The loud guard every loader here shares: a row the write guaranteed and the database does not hold is malformed. */
function required<T>(row: T | null, what: string): T {
  if (row === null) throw new Error(`publicationEvaluation: ${what} does not exist — a malformed load, not a check that failed.`);
  return row;
}

/** Everything PUBLISHABLE(v) reads for `versionId`, once, with each conjunct asked of the predicate that owns it. */
export async function evaluatePublication(
  versionId: string,
  assessment: PublicationAssessment | null,
  verification: DocumentVerification = NOT_ASKED,
): Promise<PublicationEvaluation> {
  const version = required(
    await prisma.thesisVersion.findUnique({ where: { id: versionId }, select: { id: true, thesisId: true, claim: true } }),
    `version ${versionId}`,
  );
  const thesis = required(
    await prisma.thesis.findUnique({
      where: { id: version.thesisId },
      select: { id: true, provision: true, headVersionId: true, publishedVersionId: true, publicInterestStatement: true },
    }),
    `thesis ${version.thesisId}`,
  );

  const withdrawals = await prisma.withdrawal.findMany({ where: { thesisId: thesis.id, versionId }, select: { id: true } });
  const framings = await prisma.framing.findMany({ where: { thesisId: thesis.id } });
  const rounds =
    framings.length === 0 ? [] : await prisma.framingRound.findMany({ where: { framingId: { in: framings.map((f) => f.id) } } });

  const report = await publishableEvidence(versionId, verification);
  const headed = await headFingerprint(thesis.id, versionId);
  const { resolved, missing } = await resolveTrajectoryCitations(headed.head.trajectoryIds);
  const analyses = headed.defined ? await prisma.thesisAnalysis.findMany({ where: { versionId } }) : [];
  // ONE read of the cited documents for checks 18 and 19 — and none at all when the version cites no document.
  const names = headed.head.documentNames;
  const cited = names.length === 0 ? new Map<string, CitedDocument>() : await documentsByCommitment(names);
  const documents = await documentOpeningsOf(thesis.id, names, cited);
  const quotes = await documentQuotesOf(headed.head.version, names, cited);

  return {
    versionId,
    thesis: {
      id: thesis.id,
      headVersionId: thesis.headVersionId,
      publishedVersionId: thesis.publishedVersionId,
      publicInterestStatement: thesis.publicInterestStatement,
    },
    withdrawalIds: withdrawals.map((w) => w.id),
    framingIds: framings.map((f) => f.id),
    claimFramed: claimFramed({
      version: { thesisId: version.thesisId, claim: version.claim },
      thesis: { id: thesis.id, provision: thesis.provision },
      framings,
      rounds,
    }),
    report,
    citedRecords: [...headed.head.records.map((r) => r.name), ...headed.head.documentNames],
    trajectoryIds: [...new Set(headed.head.trajectoryIds)],
    currencies: resolved.map((t) => ({ id: t.id, currency: t.currency })),
    missingTrajectoryIds: missing,
    headed,
    analysisCurrent: headed.defined && currentAnalysis(versionId, analyses, headed.fingerprint) !== null,
    list: headed.head.list,
    documents,
    quotes,
    titles: names.flatMap((name) => {
      const title = cited.get(name)?.document.title ?? null;
      return title === null ? [] : [title];
    }),
    untitled: names.filter((name) => (cited.get(name)?.document.title ?? null) === null),
    assessment,
  };
}

/**
 * The opening in force for each cited document, and its custody — CUSTODY(d) CALLED through `documentCitation`. ONLY
 * when the version cites a document: an empty subject set is EXAMINED_NONE with nothing read (the vacuity rule, plan
 * :270–:272). A cited name no document holds is a malformed version — the version write refuses it — so it is reported
 * with `custody: null` and fails the check, never dropped.
 */
async function documentOpeningsOf(
  thesisId: string,
  names: readonly string[],
  documents: ReadonlyMap<string, CitedDocument>,
): Promise<{ name: string; custody: Custody | null; opening: DocumentOpening | null }[]> {
  if (names.length === 0) return [];
  const decisions = await prisma.documentOpeningDecision.findMany({
    where: { thesisId, commitment: { in: [...names] } },
    select: { commitment: true, sequence: true, opening: true },
  });
  return names.map((name) => {
    const inForce = decisions
      .filter((d) => d.commitment === name)
      .reduce<{ sequence: number; opening: DocumentOpening } | null>(
        (latest, d) => (latest === null || d.sequence > latest.sequence ? d : latest),
        null,
      );
    return { name, custody: documents.get(name)?.custody ?? null, opening: inForce?.opening ?? null };
  });
}

/**
 * CHECK 19's SUBJECTS — document A6 :1536, A2 :1315: per DOCUMENT mention, the paragraphs carrying its token
 * (`passagesCiting`, the debate's PASSAGE rule — T3), every quoted span in them (`quotedSpans`, no floor — S6), each
 * judged by VERDICT(span, d) over CURRENT(d) (`documentPredicates.verdict`, the ONE rule, CALLED): PRESENT · ABSENT ·
 * UNCHECKED where the content is bytes or not yet derived. A span quoted twice is one subject. TO THE LETTER on two
 * documents in one paragraph (#590, gated on the live run): each span is judged against EACH document the paragraph cites.
 * A cited document no row holds is a malformed version (the write resolves every token) — loud; SHED is step 35's.
 */
async function documentQuotesOf(
  version: { id: string; text: string },
  names: readonly string[],
  documents: ReadonlyMap<string, CitedDocument>,
): Promise<DocumentQuotes[]> {
  if (names.length === 0) return [];
  const mentions = await prisma.thesisMention.findMany({
    where: { versionId: version.id, kind: 'DOCUMENT' },
    select: { id: true, name: true },
  });
  return mentions.map(({ id, name }) => {
    const cited = documents.get(name);
    if (cited === undefined) {
      throw new Error(`publicationEvaluation: version ${version.id} cites #doc_${name}, which no document holds — a malformed version.`);
    }
    if ('shed' in cited.current) throw documentShedNotBuilt(name);
    const current = 'awaiting' in cited.current ? null : cited.current;
    // WHY a span cannot be checked, when it cannot — the reason UNCHECKED carries (A3 :1386).
    const unchecked =
      current === null
        ? 'AWAITING_DERIVATION — the document has no content version under the current extractor, so there is no text to search yet'
        : 'the content is the bytes (document flows §3 :359–:365) — there is no computed text to search';
    const spans = [...new Set(passagesCiting(version, name, 'DOCUMENT').flatMap(quotedSpans))];
    return {
      mentionId: id,
      name,
      spans: spans.map((span): QuotedSpan => {
        const value = documentVerdict(span, current);
        return value === 'UNCHECKED' ? { span, verdict: value, reason: unchecked } : { span, verdict: value };
      }),
    };
  });
}

/** Check 18's failure for one cited document, or null — A6 :1535: an opening decided, and never BYTES on a sealed one. */
function openingFailure(d: PublicationEvaluation['documents'][number]): { name: string; opening: DocumentOpening | null; detail: string } | null {
  if (d.custody === null) return { name: d.name, opening: d.opening, detail: 'no document of this name is held — a malformed citation' };
  if (d.opening === null) {
    return {
      name: d.name,
      opening: null,
      detail: 'no opening is decided for this document on this thesis — what publication opens of it is decided before publishing',
    };
  }
  if (d.opening === 'BYTES' && d.custody === 'SEALED') {
    return { name: d.name, opening: d.opening, detail: 'BYTES cannot be opened on a sealed document — the platform holds no bytes of it' };
  }
  return null;
}

const row = (
  id: ThesisCheckId,
  kind: 'hard' | 'advisory',
  examined: unknown[],
  failures: unknown[],
  none = false,
): ThesisCheck => ({ id, kind, verdict: failures.length > 0 ? 'FAIL' : none ? 'EXAMINED_NONE' : 'PASS', examined, failures });

/**
 * A6's FIRST SEVENTEEN ROWS, in A6's order (:1591–:1601), each naming what it examined and each failure its subject; an
 * empty scope is EXAMINED_NONE with `examined` present at zero — then check 18, DOCUMENT_OPENING_DECIDED (document A6
 * :1535), BY ADDITION AT DOCUMENT STEP 33 (plan :255): a hard row over the version's `#doc_` citations, EXAMINED_NONE on
 * a version citing none. Then check 19, DOCUMENT_QUOTES_PRESENT (document A6 :1536), BY ADDITION AT DOCUMENT STEP 34: a
 * hard row naming every quoted span it examined with its verdict, failing on each ABSENT one; EXAMINED_NONE with
 * `examined: []` on a version citing no document (plan :270–:272).
 */
export function rowsOf(e: PublicationEvaluation): ThesisCheck[] {
  const { versionId, thesis, assessment } = e;

  const headFailure =
    thesis.headVersionId !== versionId
      ? `version ${versionId} is not the head (${String(thesis.headVersionId)}) — only the head is published`
      : thesis.publishedVersionId === versionId
        ? `version ${versionId} IS the published version — publishing it again is nothing new`
        : e.withdrawalIds.length > 0
          ? `version ${versionId} was withdrawn — write a new version`
          : null;

  const gaps = gapsDecided(e.list);
  const open = e.list.filter((g) => g.readsAs === 'OPEN');
  // THE VERDICT IS THE PREDICATE'S, THE SUBJECTS ARE ITS LIST (R49 chunk 2, REVIEW's H1): GAPS_DECIDED decides whether row
  // 14 fails; the entries reading OPEN are what it names. The two are one fact read twice, so a disagreement is a defect in
  // one of them — a LOUD GUARD, never a verdict with no subject or a subject under a pass.
  if (gaps.decided === open.length > 0) {
    throw new Error(
      `publicationEvaluation: GAPS_DECIDED answers decided=${String(gaps.decided)} while ${String(open.length)} gap(s) of ` +
        'the list read OPEN — the predicate and the list it read disagree, so row 14 has no honest verdict.',
    );
  }
  const stale = e.currencies.filter((t) => !trajectoryCurrent(t.currency));

  return [
    row(
      'HEAD_VERSION',
      'hard',
      [{ versionId, headVersionId: thesis.headVersionId, publishedVersionId: thesis.publishedVersionId, withdrawalIds: e.withdrawalIds }],
      headFailure === null ? [] : [{ versionId, detail: headFailure }],
    ),
    row(
      'CLAIM_FRAMED',
      'hard',
      e.framingIds.map((framingId) => ({ framingId })),
      e.claimFramed
        ? []
        : e.framingIds.length === 0
          ? [{ versionId, detail: 'no framing is attached to the thesis, so no framing chose this claim' }]
          : e.framingIds.map((framingId) => ({ framingId, detail: 'chose no ASSESSED claim equal to this version\'s under this provision' })),
    ),
    row(
      'CITES_EVIDENCE',
      'hard',
      e.citedRecords.map((name) => ({ name })),
      e.citedRecords.length === 0 ? [{ versionId, detail: 'the version cites no record the corpus holds' }] : [],
    ),
    row(
      'PUBLIC_INTEREST_STATEMENT',
      'hard',
      [{ thesisId: thesis.id }],
      (thesis.publicInterestStatement ?? '').trim() === '' ? [{ thesisId: thesis.id, detail: 'the thesis has no public-interest statement' }] : [],
    ),
    ...checksOf(e.report),
    row(
      'TRAJECTORIES_RESOLVE',
      'hard',
      e.trajectoryIds.map((trajectoryId) => ({ trajectoryId })),
      e.missingTrajectoryIds.map((trajectoryId) => ({ trajectoryId, detail: 'no stored detection pass holds this trajectory' })),
      e.trajectoryIds.length === 0,
    ),
    row(
      'TRAJECTORIES_CURRENT',
      'hard',
      e.currencies.map((t) => ({ trajectoryId: t.id, state: t.currency.state })),
      stale.map((t) => ({ trajectoryId: t.id, state: t.currency.state, detail: 'the newest detection pass does not agree with the cited one' })),
      e.currencies.length === 0,
    ),
    row(
      'ANALYSIS_CURRENT',
      'hard',
      [{ versionId, fingerprint: e.headed.defined ? e.headed.fingerprint : null }],
      e.analysisCurrent
        ? []
        : [
            {
              versionId,
              detail: e.headed.defined
                ? 'no analysis of this version read its current input — run the critic (a stale analysis is named, never run)'
                : `the input cannot be fingerprinted: ${e.headed.named} awaits derivation`,
            },
          ],
    ),
    row(
      'GAPS_DECIDED',
      'hard',
      e.list.map((g) => ({ gapId: g.gapId, readsAs: g.readsAs })),
      gaps.decided ? [] : open.map((g) => ({ gapId: g.gapId, readsAs: g.readsAs })),
      gaps.examined === 0,
    ),
    row(
      'RATIONALE_SUBSTANCE',
      'hard',
      assessment === null ? [] : [{ versionId }],
      assessment === null || assessment.substance ? [] : [{ versionId, detail: 'the assessor found no argued rationale for this version' }],
      assessment === null,
    ),
    row(
      'NAMES_NO_PERSON',
      'hard',
      // The names the assessor listed, each cited document's TITLE it was handed to examine (A6 :1537; Q15) — and each cited
      // document with NO title, named NOT EXAMINED: the check names what it examined, and an untitled one was not (LOW-m).
      assessment === null
        ? []
        : [
            ...assessment.names,
            ...e.titles.map((title) => ({ title })),
            ...e.untitled.map((commitment) => ({ commitment, title: null, examined: false })),
          ],
      assessment === null ? [] : assessment.names.map((name) => ({ name })),
      assessment === null,
    ),
    row(
      'ALLEGATIONS_FRAMED',
      'advisory',
      assessment === null ? [] : [{ versionId }],
      assessment === null || assessment.allegationsFramed ? [] : [{ versionId, detail: 'the assessor found a claim not framed as an allegation' }],
      assessment === null,
    ),
    row(
      'DOCUMENT_OPENING_DECIDED',
      'hard',
      e.documents.map((d) => ({ name: d.name, opening: d.opening })),
      e.documents.flatMap((d) => {
        const failure = openingFailure(d);
        return failure === null ? [] : [failure];
      }),
      e.documents.length === 0,
    ),
    row(
      'DOCUMENT_QUOTES_PRESENT',
      'hard',
      e.quotes.map(({ name, spans }) => ({ name, spans })),
      e.quotes.flatMap(({ name, spans }) =>
        spans
          .filter((s) => s.verdict === 'ABSENT')
          .map(({ span }) => ({ name, span, detail: 'the version quotes a phrase the document does not contain, in the content the platform holds' })),
      ),
      e.quotes.length === 0,
    ),
  ];
}

/**
 * PUBLISHABLE(v), folded from THE ROWS (A3 :1390–:1396): the HARD rows that FAIL, in A6's order — an advisory row binds
 * nothing (A6 :1605–:1608) — and publishable only when none fails AND the evidence half could be graded at all: a
 * not-evaluable half is not publishable and names nothing (the §2b seam, the researcher's; `derivations.test.ts` L1).
 */
export function publishabilityOf(e: PublicationEvaluation): { publishable: boolean; failed: string[] } {
  const failed = rowsOf(e)
    .filter((r) => r.kind === 'hard' && r.verdict === 'FAIL')
    .map((r) => r.id);
  return { publishable: failed.length === 0 && e.report.evaluable, failed };
}
