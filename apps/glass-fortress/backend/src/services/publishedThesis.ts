import { prisma } from '../lib/prisma';
import { provisionTitleOf } from '../lib/provisions';
import { chunksOf, pairName, resolveRecordByName, type ResolvedRecord } from './corpusReads';
import { argued, EVER_PUBLISHED, flagged, verified } from './evidencePredicates';
import type { PublicationMaterial } from './publicationAssessor';
import { decisionsAtPublication, gapList, theCall, theRequests, trajectoryCurrent } from './thesisPredicates';
import { resolveTrajectoryCitations } from './trajectoryCitation';
import { refusal, type Refusal } from '../mcp/tools/thesisRefusals';

// ---------------------------------------------------------------------------
// WHAT A VERSION PUBLISHES — docs/gf-thesis-flows.md T5 :795–:853, T6 :914–:918, A3 :1399–:1406 as amended, A5
// :1559–:1570; thesis step 23.
//
// ONE LOADER OF THE APPEALS. `get_whistleblower_call` answers them for the published version, and the publication
// assessor is handed them for the head AS IF IT WERE PUBLISHED (the R49 sketch §d1): one function over one version id,
// so what check 16 examined is exactly what a publication makes public.
//
// THE PUBLIC READS' BODIES (`routes/publicThesisRoutes.ts`, sketch §e4). Each reads no caller, so every reader gets the
// same bytes. What a body carries is the researcher's approved words and the corpus's mechanical facts; what it never
// carries is a model's opinion or a working row — no analysis, assessment, objection, framing round, debate, note,
// withdrawal reason, gap reason or refused rationale (T5 :826–:829; A7 :1688–:1689).
//
// "EVER PUBLISHED" IS `EVER_PUBLISHED`, the one spelling in evidence's predicate module (ruling 3(c)). A version NAMED BY
// A WITHDRAWAL is never served as text — read from the Withdrawal rows, never inferred from dates (R11, R16).
//
// It holds a client and no model; it writes nothing and opens no transaction.
// ---------------------------------------------------------------------------

/**
 * The intake instruction — the researcher's ruling of 2026-09-14 (R48 §6-R21): T4 :678's instruction verbatim, and one
 * sentence that the channel for an answer opens with the document intake, naming no URL. Visible Hebrew on a PUBLIC read.
 */
export const INTAKE =
  'שלחו את הבקשה בשמכם. ' +
  'ערוץ ההגשה של מסמכים ותשובות לפלטפורמה ייפתח עם קליטת המסמכים; עד אז הקריאה והבקשות פתוחות, ודרך ההגשה עדיין לא.';

/** THE_CALL and THE_REQUESTS over the decisions decided at or before `versionId` (the researcher's ruling, 2026-09-14). */
export async function publishedAppeals(thesisId: string, versionId: string): Promise<{ call: unknown[]; requests: unknown[] }> {
  const versions = await prisma.thesisVersion.findMany({
    where: { thesisId },
    select: { id: true, parentVersionId: true },
  });
  const decisions = await prisma.thesisGapDecision.findMany({ where: { thesisId } });
  // THE VERSION'S NAMES (R48 §6-R29). They can only turn a gap CITED → OPEN, which neither appeal reads — the call is
  // CALLED gaps, the requests REQUESTED ones — so this read is kept for `gapList`'s contract, not for the answer.
  const mentions = await prisma.thesisMention.findMany({ where: { versionId }, select: { name: true } });

  const list = gapList(
    decisionsAtPublication(decisions, versions, versionId),
    thesisId,
    mentions.map((m) => m.name),
  );
  return { call: theCall(true, list), requests: theRequests(true, list) };
}

/**
 * What the publication assessor is handed for `versionId` (the R49 sketch §d1): the claim, the provision, the text
 * VERBATIM, the appeals as they would publish with it, and the rationale — and nothing of the corpus: no record is
 * resolved, so a citation reaches the assessor as the name the text carries.
 */
export async function assessorMaterial(
  thesis: { id: string; provision: string | null },
  versionId: string,
  rationale: string,
): Promise<PublicationMaterial> {
  const version = await prisma.thesisVersion.findUnique({ where: { id: versionId }, select: { text: true, claim: true } });
  if (version === null) {
    throw new Error(`publishedThesis: thesis ${thesis.id} points at version ${versionId}, which does not exist.`);
  }
  const { call, requests } = await publishedAppeals(thesis.id, versionId);
  return { claim: version.claim, provision: thesis.provision, text: version.text, call, requests, rationale };
}

// ---------------------------------------------------------------------------
// GET /api/thesis — list_theses' anonymous answer (A4 :1427)
// ---------------------------------------------------------------------------

export interface PublishedEntry {
  thesisId: string;
  claim: string;
  provision: string | null;
  publishedAt: Date | null;
  author: string;
  contentHash: string;
}

/** Every thesis with PUBLISHED(t), as A4 :1427 shapes it — identical for every caller. */
export async function publishedEntries(): Promise<PublishedEntry[]> {
  const theses = await prisma.thesis.findMany({
    where: { publishedVersionId: { not: null } },
    select: { id: true, provision: true, createdById: true, publishedVersionId: true, publishedAt: true },
  });
  const handles = await handlesOf(theses.map((t) => t.createdById));

  const entries: PublishedEntry[] = [];
  for (const thesis of theses) {
    if (thesis.publishedVersionId === null) continue;
    const version = await prisma.thesisVersion.findUnique({
      where: { id: thesis.publishedVersionId },
      select: { claim: true, contentHash: true },
    });
    if (version === null) {
      throw new Error(`publishedThesis: thesis ${thesis.id} is published at ${thesis.publishedVersionId}, which does not exist.`);
    }
    entries.push({
      thesisId: thesis.id,
      claim: version.claim,
      provision: thesis.provision,
      publishedAt: thesis.publishedAt,
      author: handleOf(handles, thesis.createdById, thesis.id),
      contentHash: version.contentHash,
    });
  }
  return entries;
}

/** The handles of these researchers, by id — one query. */
export async function handlesOf(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.researcher.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, handle: true } });
  return new Map(rows.map((r) => [r.id, r.handle]));
}

/**
 * A researcher's handle — `Researcher.handle`, the only public identifier (schema :33). A missing row is a broken foreign
 * key, and says so: never an anonymous author (R47 §6-R8).
 */
export function handleOf(handles: ReadonlyMap<string, string>, researcherId: string, thesisId: string): string {
  const handle = handles.get(researcherId);
  if (handle === undefined) {
    throw new Error(
      `publishedThesis: thesis ${thesisId} names researcher ${researcherId}, and no such researcher exists. ` +
        'A thesis cannot outlive its author row; this is a broken foreign key, not an anonymous author.',
    );
  }
  return handle;
}

// ---------------------------------------------------------------------------
// GET /api/thesis/:id and /:id/versions/:v — T5 :804–:853, T6 :914–:918, A5 :1565–:1570
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

interface EvidenceCitation {
  kind: 'EVIDENCE';
  name: string;
  pin: string | null;
  record: { url: string; capture: string } | { url: string; before: string; after: string };
  content: { kind: 'CAPTURE'; text: string } | { kind: 'DIFF'; chunks: { side: string; text: string }[] };
  verified: { verified: boolean; captures: { capture: string; attributed: boolean | null; anchoredHashMatchesDocumentHash: boolean }[] } | { notEvaluable: string };
  flag: { flagged: boolean; reasons: readonly string[] };
  argued: boolean;
  /** The FACT that the citation was promoted over the debate assessor's objection — never the objection (T5 :816). */
  overObjection: boolean;
}

type TrajectoryCitation =
  | { kind: 'TRAJECTORY'; name: string; resolves: true; claimText: string; url: string; transitions: number; current: boolean }
  | { kind: 'TRAJECTORY'; name: string; resolves: false };

type HistoryEntry =
  | { versionId: string; contentHash: string; publishedAt: Date; citations: CitationRef[] }
  | { versionId: string; publishedAt: Date; withdrawn: true; withdrawnAt: Date };

interface ThesisPage {
  thesisId: string;
  publicInterestStatement: string | null;
  claim: string;
  provision: string | null;
  /** The provision named by its table entry (docs/gf-ui-flows.md §17 :529–:530) — the page never spells a title of its own. */
  provisionTitle: string | null;
  version: { versionId: string; text: string; contentHash: string; publishedAt: Date | null; author: string };
  citations: (EvidenceCitation | TrajectoryCitation)[];
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
  const thesis = await prisma.thesis.findUnique({
    where: { id: thesisId },
    select: { id: true, provision: true, createdById: true, publishedVersionId: true, publishedAt: true, publicInterestStatement: true },
  });
  if (thesis === null) return null;
  const versions = await prisma.thesisVersion.findMany({
    where: { thesisId, ...EVER_PUBLISHED },
    select: { id: true, text: true, claim: true, contentHash: true },
  });
  if (versions.length === 0) return null;
  const attempts = await prisma.publicationAttempt.findMany({
    where: { thesisId, outcome: 'PUBLISHED' },
    select: { versionId: true, rationale: true, verdict: true, createdAt: true },
  });
  const withdrawals = await prisma.withdrawal.findMany({ where: { thesisId }, select: { versionId: true, createdAt: true } });
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

async function citationRefsOf(versionId: string): Promise<CitationRef[]> {
  const mentions = await prisma.thesisMention.findMany({ where: { versionId }, select: { kind: true, name: true, contentVersionHash: true } });
  return mentions.map((m) => ({ kind: m.kind, name: m.name, pin: m.contentVersionHash }));
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

  const mentions = await prisma.thesisMention.findMany({
    where: { versionId: pin },
    select: {
      id: true,
      kind: true,
      name: true,
      contentVersionHash: true,
      debateSession: { select: { status: true, recordFileHash: true, thesisId: true, promotedOverObjection: true } },
    },
  });
  const citations: (EvidenceCitation | TrajectoryCitation)[] = [];
  // url → trackedUrlId, one entry per cited page.
  const pages = new Map<string, string>();
  const trajectoryIds = mentions.filter((m) => m.kind === 'TRAJECTORY').map((m) => m.name);
  const { resolved } = await resolveTrajectoryCitations(trajectoryIds);
  for (const mention of mentions) {
    if (mention.kind === 'TRAJECTORY') {
      const t = resolved.find((r) => r.id === mention.name);
      citations.push(
        t === undefined
          ? { kind: 'TRAJECTORY', name: mention.name, resolves: false }
          : { kind: 'TRAJECTORY', name: mention.name, resolves: true, claimText: t.claimText, url: t.url, transitions: t.transitions, current: trajectoryCurrent(t.currency) },
      );
      continue;
    }
    const record = await resolveRecordByName(mention.name);
    if (record === null) {
      throw new Error(`publishedThesis: published version ${pin} cites #ev_${mention.name}, which no record of the corpus resolves.`);
    }
    pages.set(record.page.url, record.page.id);
    citations.push(await evidenceCitation(thesis.id, mention, record));
  }

  const handles = await handlesOf([thesis.createdById]);
  const analyses = await prisma.thesisAnalysis.findMany({ where: { versionId: pin }, select: { id: true } });
  const { call, requests } = await publishedAppeals(thesis.id, pin);

  return {
    thesisId: thesis.id,
    publicInterestStatement: thesis.publicInterestStatement,
    claim: version.claim,
    provision: thesis.provision,
    provisionTitle: provisionTitleOf(thesis.provision),
    version: { versionId: pin, text: version.text, contentHash: version.contentHash, publishedAt: thesis.publishedAt, author: handleOf(handles, thesis.createdById, thesis.id) },
    citations,
    appeals: { call, requests, intake: INTAKE },
    rationale: attempt.rationale,
    overObjection: attempt.verdict === 'DISPUTES',
    analysisRun: analyses.length > 0,
    history: await historyOf(versions, attempts, withdrawals),
    pages: [...pages].map(([url, trackedUrlId]) => ({ trackedUrlId, url })),
  };
}

/** Every ever-published version, oldest first; a version NAMED BY A WITHDRAWAL keeps its dates and nothing of its content (R11). */
async function historyOf(
  versions: readonly { id: string; contentHash: string }[],
  attempts: readonly { versionId: string; createdAt: Date }[],
  withdrawals: readonly { versionId: string; createdAt: Date }[],
): Promise<HistoryEntry[]> {
  const entries: HistoryEntry[] = [];
  for (const version of versions) {
    const publishedAt = publishedAtOf(attempts, version.id);
    const withdrawal = newestWithdrawal(withdrawals, version.id);
    entries.push(
      withdrawal === undefined
        ? { versionId: version.id, contentHash: version.contentHash, publishedAt, citations: await citationRefsOf(version.id) }
        : { versionId: version.id, publishedAt, withdrawn: true, withdrawnAt: withdrawal.createdAt },
    );
  }
  return entries.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
}

/** One EVIDENCE citation resolved as T5 :812–:817 lists it, each fact from its own predicate. */
async function evidenceCitation(
  thesisId: string,
  mention: {
    id: string;
    name: string;
    contentVersionHash: string | null;
    debateSession: { status: string; recordFileHash: string; thesisId: string; promotedOverObjection: boolean } | null;
  },
  record: ResolvedRecord,
): Promise<EvidenceCitation> {
  const pin = mention.contentVersionHash;
  if (pin === null) {
    throw new Error(`publishedThesis: the EVIDENCE citation ${mention.id} carries no pin — the version write computes one for every record.`);
  }
  const report = await verified(mention.name);
  const flag = await flagged(mention.id);
  return {
    kind: 'EVIDENCE',
    name: mention.name,
    pin,
    record:
      record.diff === null
        ? { url: record.page.url, capture: captureOf(record).capture }
        : { url: record.page.url, before: record.diff.before.capture, after: record.diff.after.capture },
    content: await pinnedContent(record, pin),
    verified: report.evaluable
      ? {
          verified: report.verified,
          captures: report.captures.map((c) => ({ capture: c.capture, attributed: c.attributed, anchoredHashMatchesDocumentHash: c.anchoredHashMatchesDocumentHash })),
        }
      : { notEvaluable: report.reason },
    flag: { flagged: flag.flagged, reasons: flag.reasons },
    argued: argued({ name: mention.name, thesisId, debate: mention.debateSession }),
    overObjection: mention.debateSession?.promotedOverObjection === true,
  };
}

function captureOf(record: ResolvedRecord) {
  if (record.capture === null) {
    throw new Error(`publishedThesis: ${record.fileHash} resolved to neither a capture nor a diff (evidence A1).`);
  }
  return record.capture;
}

/**
 * The PINNED content version's computed content (T5 :813): a diff's chunks at the pin, from the versions the resolver
 * already loaded and through `chunksOf`, the one reader of stored chunks; a capture's text at the pin — the snapshot's
 * text when the pin is its current text, else the kept text version.
 */
async function pinnedContent(record: ResolvedRecord, pin: string): Promise<EvidenceCitation['content']> {
  const { diff } = record;
  if (diff !== null) {
    const version = diff.versions.find((v) => v.contentVersionHash === pin);
    if (version === undefined) {
      throw new Error(`publishedThesis: no content version ${pin} of the diff ${pairName(diff)} — a pin names a version the walk stored.`);
    }
    return { kind: 'DIFF', chunks: chunksOf(version.chunks, pairName(diff)).map((c) => ({ side: c.side, text: c.text })) };
  }
  const capture = captureOf(record);
  const held =
    capture.textHash === pin
      ? await prisma.urlSnapshot.findUnique({ where: { id: capture.id }, select: { text: true } })
      : await prisma.textVersion.findUnique({ where: { snapshotId_textHash: { snapshotId: capture.id, textHash: pin } }, select: { text: true } });
  if (held === null) {
    throw new Error(`publishedThesis: capture ${capture.capture} holds no text at the pin ${pin} — a pin names a text the walk kept.`);
  }
  return { kind: 'CAPTURE', text: held.text };
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
