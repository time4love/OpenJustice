import type { MentionType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import type { ChunkSide } from '../lib/diffChunking';
import { chunksOf, heldTextKey, heldTextsFor, pairName, recordsByName, type ResolvedRecord } from './corpusReads';
import { argued, flaggedFor, verifiedFor, type FlagReport, type VerifiedReport } from './evidencePredicates';
import { documentsByCommitment, type CitedDocument } from './documentCitation';
import type { PublicationMaterial } from './publicationAssessor';
import { decisionsAtPublication, gapList, theCall, theRequests, trajectoryCurrent, type CitedMention } from './thesisPredicates';
import { resolveTrajectoryCitations, type TrajectoryCurrency } from './trajectoryCitation';

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
 * VERBATIM, the appeals as they would publish with it, the TITLE of every document the version cites (R84 Q15 — published
 * with the citation, so examined for names like the text), and the rationale — and nothing of the corpus: no record is
 * resolved and no document's text is read, so a citation reaches the assessor as the name the text carries.
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
  const cited = await prisma.thesisMention.findMany({ where: { versionId, kind: 'DOCUMENT' }, select: { name: true } });
  const documents = await documentsByCommitment(cited.map((m) => m.name));
  // Every document a version cites was written with a title (A2, NO_TITLE since 2026-09-23); a cited one without is a
  // pre-rule row, and it is handed as nothing rather than as an empty title the model would read as "no name here".
  const titles = cited.flatMap((m) => {
    const title = documents.get(m.name)?.document.title ?? null;
    return title === null ? [] : [title];
  });
  return { claim: version.claim, provision: thesis.provision, text: version.text, call, requests, titles, rationale };
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
// THE CITATION SHAPES AND THE ONE RESOLVER — T5 :811–:818, thesis A4 :1476. The public page's two cores moved to
// `publicThesisPage.ts` at document step 34 (the researcher's Q-A, R85): a DOCUMENT citation's public block asks the chain.
// ---------------------------------------------------------------------------

export interface EvidenceCitation {
  kind: 'EVIDENCE';
  name: string;
  pin: string | null;
  record: { url: string; capture: string } | { url: string; before: string; after: string };
  /**
   * `side` NARROWED 2026-09-19 from `string`. This line is the LAST widening on the path from the walk to a
   * reader: `chunksOf` hands `pinnedContent` a narrow value and this shape widened it again on the way out,
   * so the frontend's `CitedContent` inherited `string` and its „before" comparison type-checked. The wire
   * is now the union end to end (UI plan :555).
   */
  content: { kind: 'CAPTURE'; text: string } | { kind: 'DIFF'; chunks: { side: ChunkSide; text: string }[] };
  verified: { verified: boolean; captures: { capture: string; attributed: boolean | null; anchoredHashMatchesDocumentHash: boolean }[] } | { notEvaluable: string };
  flag: { flagged: boolean; reasons: readonly string[] };
  argued: boolean;
  /** The FACT that the citation was promoted over the debate assessor's objection — never the objection (T5 :816). */
  overObjection: boolean;
}

/**
 * A DOCUMENT citation, resolved — thesis A4 :1476's DOCUMENT arm (R81 QC) WITHOUT `verified`.
 *
 * `verified` is VERIFIED(d) = RECOMPUTABLE(d) AND ANCHORED(d) (document A6 :1529), and ANCHORED(d) is a CHAIN READ
 * (A3 :1366). This module is imported by `debateState.ts`, a research act (`handlesOf`), so a chain read here would reach
 * the debate through a chain of imports (`test/researchActsReachNoChain.test.ts`). The gated read completes the arm
 * through `documentStanding.verifiedOf`, the one module that asks the chain, which no research act imports.
 * `custody` is HELD or SEALED only: a SHED document cannot be cited (the version write refuses SHED) — a cited one that
 * was shed after is FLAGGED's SHED arm, step 35's, and this resolver refuses it LOUDLY until then.
 */
export interface DocumentCitationBase {
  kind: 'DOCUMENT';
  name: string;
  pin: string;
  argued: boolean;
  title: string | null;
  custody: 'HELD' | 'SEALED';
  flag: { flagged: boolean; reasons: readonly string[] };
  overObjection: boolean;
}

export type TrajectoryCitation =
  | { kind: 'TRAJECTORY'; name: string; resolves: true; claimText: string; url: string; transitions: number; current: boolean }
  | { kind: 'TRAJECTORY'; name: string; resolves: false };

/** One version's RESOLVED citations, and the rows UNARGUED reads — both off the one read of its mentions. */
export interface VersionCitations {
  citations: (EvidenceCitation | TrajectoryCitation | DocumentCitationBase)[];
  /**
   * The same mentions as `thesisPredicates.CitedMention`, for UNARGUED(v).
   *
   * It rides this answer rather than being read again: `unargued` is CALLED and never re-derived (A3 :1371),
   * and its input is a projection of the very rows resolved here — a second `thesisMention.findMany` for them
   * would be one more query per version for rows already in hand.
   */
  cited: CitedMention[];
}

/**
 * The mention rows this resolver reads — the shape `services/thesisRows.MentionRow` already carries.
 *
 * It is a PARAMETER rather than a query so the gated read can hand rows it has already loaded. The type is
 * spelled here, structurally, rather than imported from `thesisRows`: this module is the PUBLIC page's and
 * must not depend on the gated read's loader (the standing rule that a module holding a client depends on the
 * pure one, never the other way).
 */
export interface CitationMention {
  id: string;
  versionId: string;
  /**
   * `MentionType`, NOT A HAND-WRITTEN UNION — widened at document refactor step 28, which
   * added DOCUMENT to the enum. The union here said `'EVIDENCE' | 'TRAJECTORY'` and was a
   * SECOND SPELLING of the schema's enum that happened to agree with it while there were
   * two kinds; the compiler named this site the moment there were three, which is the
   * enumeration `anchoredCaptureHash.ts` :64-:67 describes — "a compiler's list is complete
   * and a grep's is not".
   *
   * ALL THREE ARE RESOLVED SINCE DOCUMENT STEP 33, which writes the first `#doc_` mention:
   * the DOCUMENT arm below answers the working view (thesis A4 :1476, R81 QC), and the PUBLIC
   * page refuses it by name (`publicCitations`) until step 34 builds what the public reads.
   */
  kind: MentionType;
  name: string;
  contentVersionHash: string | null;
  debateSession: { status: string; recordFileHash: string; thesisId: string; promotedOverObjection: boolean } | null;
}

/** What `citationsByVersion` answers: each version's citations, and the cited pages of the whole set. */
export interface ResolvedCitations {
  byVersion: Map<string, VersionCitations>;
  /**
   * Every EVIDENCE name asked for, resolved to the record the corpus holds — the ROWS, not a verdict.
   *
   * It rides this answer because FINGERPRINT(head) is computed over the same records (`criticMaterial.ts`
   * :102) and resolving them twice in one read walked the corpus twice. A `ResolvedRecord` is an OBSERVATION,
   * which evidence A3 :1060–:1063 permits sharing; every predicate over it is still CALLED (A3 :1413–:1414).
   */
  records: Map<string, ResolvedRecord>;
  /**
   * Every DOCUMENT commitment asked for that names a document — the ONE document read this resolver made. REVIEWS
   * names an unargued document from it (R81 QB), and the gated read computes VERIFIED(d) over it, so neither reads
   * the rows again.
   */
  documents: Map<string, CitedDocument>;
  /**
   * Every cited page of every version asked for, DEDUPLICATED BY URL — thesis A4 :1476's union.
   *
   * The gated read asks for HEAD and PUBLISHED together and gets their union for free, which is what that
   * clause requires: the working view's centre draws HEAD's text with PUBLISHED one toggle away, and BOTH
   * texts' chips resolve `pageId` from this ONE list (`ThesisText.tsx` :49, by URL), so a list covering one
   * version loses every link on the toggle. A caller asking for one version gets that version's pages.
   */
  pages: { trackedUrlId: string; url: string }[];
  /**
   * FLAGGED(m) for every EVIDENCE mention resolved here — mention id → the report, `flaggedFor`'s OWN answer.
   *
   * IT IS THE PREDICATE CALLED ONCE, NOT A CACHE OF IT. `flaggedFor` is FLAGGED's plural, exported from the
   * predicate's own module (evidence A7 :1302-:1303), and this read calls it exactly once for the whole set; what
   * rides here is that one call's answer, for the consumers of THIS read. Nothing is stored and nothing is read
   * back on a later read, which is what evidence A3 :1060-:1063 forbids — `corpusReads.ts` :522-:525 states the
   * same of itself. A second `flaggedFor` inside REVIEWS' arm would be two evaluations of ONE predicate in one
   * body, which is the cost thesis A4 :1476's "ZERO EXTRA QUERIES" names.
   */
  flags: ReadonlyMap<string, FlagReport>;
  /**
   * The currency of every TRAJECTORY citation resolved here — the id → the currency of the pass it pins.
   *
   * `resolveTrajectoryCitations` is the ONE resolver and this read already calls it; a name ABSENT from this map
   * is a citation no stored pass holds, which is the `missing` arm `thesisPredicates.staleTrajectories` returns
   * whole so each caller can say what it means (A3 :1386-:1388). The wire carries only `current: boolean` (A4
   * :1476, `currency` dropped 2026-09-21), and this is the internal signal that decided it.
   */
  trajectories: ReadonlyMap<string, TrajectoryCurrency>;
}

/**
 * THE ONE RESOLVER OF A VERSION'S CITATIONS — the public page's and the working view's alike (A4 :1476).
 *
 * It was inline in `pageOf` and SINGLE-VERSION, and the gated read needs the same resolution for HEAD and for
 * PUBLISHED. Writing a second one there would be this repository's own named defect shape — one rule, two
 * implementations — so it is lifted here and takes a SET of version ids.
 *
 * THE SET IS WHY THIS IS NOT A LOOP. Every plural below is asked ONCE for every version's names together, so
 * the number of queries does not grow with the number of citations NOR with the number of versions: two
 * versions citing twelve records cost what one citing two does. Calling a single-version resolver twice would
 * have doubled eight reads for an answer one pass gives.
 *
 * `thesisId` is ARGUED's, not the versions' — a debate argues for a record on a thesis (A3 :1373).
 */
export async function citationsByVersion(thesisId: string, versionIds: readonly string[]): Promise<ResolvedCitations> {
  const wanted = [...new Set(versionIds)];
  if (wanted.length === 0) return citationsFrom(thesisId, [], wanted);
  const mentions = await prisma.thesisMention.findMany({
    where: { versionId: { in: wanted } },
    select: {
      id: true,
      versionId: true,
      kind: true,
      name: true,
      contentVersionHash: true,
      debateSession: { select: { status: true, recordFileHash: true, thesisId: true, promotedOverObjection: true } },
    },
  });
  return citationsFrom(thesisId, mentions, wanted);
}

/**
 * THE RESOLVER ITSELF, over mention rows the caller already holds — `citationsByVersion` is this with the one
 * query in front of it.
 *
 * THE SPLIT IS WHAT REMOVES A READ, NOT A SECOND RESOLVER. The gated read loads every version's mentions once
 * (`services/thesisRows`), and asking this function to read them again was one of the duplicate reads
 * `docs/gf-thesis-read-cost-2026-09-22.md` measured. Both doors run THIS body, so there is one resolution and
 * one citation shape (A4 :1476).
 *
 * `mentions` may name versions outside `versionIds`; they are filtered here rather than by the caller, so the
 * caller cannot get the filter wrong and the loud guard below still means what it says.
 */
export async function citationsFrom(
  thesisId: string,
  allMentions: readonly CitationMention[],
  versionIds: readonly string[],
): Promise<ResolvedCitations> {
  const wanted = [...new Set(versionIds)];
  // An entry for every id asked for, so a version that cites nothing is an empty list and never a missing key.
  const byVersion = new Map<string, VersionCitations>(wanted.map((id) => [id, { citations: [], cited: [] }]));
  // url → trackedUrlId, one entry per cited page.
  const pages = new Map<string, string>();
  if (wanted.length === 0) return { byVersion, records: new Map(), documents: new Map(), pages: [], flags: new Map(), trajectories: new Map() };

  const asked = new Set(wanted);
  const mentions = allMentions.filter((m) => asked.has(m.versionId));
  const trajectoryIds = mentions.filter((m) => m.kind === 'TRAJECTORY').map((m) => m.name);
  const { resolved } = await resolveTrajectoryCitations(trajectoryIds);

  // ONE PASS FOR THE WHOLE SET, and every one of these is a PLURAL THE PREDICATE'S OWN MODULE EXPORTS — never
  // a fold written here. Evidence A7 :1302–:1303 gives each predicate one importable symbol and A6 :1219
  // forbids a caller re-deriving it; a batching helper in this file would be a second spelling of VERIFIED and
  // FLAGGED, which is what the one-symbol scan refuses. The trajectory half above has always been plural —
  // this makes the evidence half the shape its neighbour already had, ten lines away in the same loop.
  // `=== 'EVIDENCE'`, never `!== 'TRAJECTORY'`: with three kinds those stopped being the
  // same set, and "not a trajectory" would have swept a DOCUMENT mention into the evidence
  // resolver silently. Step 28 made the difference real; the explicit arm below names it.
  const evidenceMentions = mentions.filter((m) => m.kind === 'EVIDENCE');
  const names = evidenceMentions.map((m) => m.name);
  const documentMentions = mentions.filter((m) => m.kind === 'DOCUMENT');
  // SIBLINGS, NOT A SEQUENCE. None of the four reads the others' answer — they are plurals over the same name
  // sets — and awaited in turn they cost the SUM of their round trips. Only `heldTextsFor` depends on one of them
  // (it needs each record's capture id), so it alone waits. FLAGGED(m) is asked for DOCUMENT mentions too: it is
  // evidence A3's predicate over the Evidence row (document A3 :1382), CALLED, never a second spelling here.
  const [records, reports, flags, documents] = await Promise.all([
    recordsByName(names),
    verifiedFor(names),
    flaggedFor([...evidenceMentions, ...documentMentions].map((m) => m.id)),
    documentsByCommitment(documentMentions.map((m) => m.name)),
  ]);
  const held = await heldTextsFor(
    evidenceMentions.flatMap((mention) => {
      const record = records.get(mention.name);
      // Only a CAPTURE citation names a held text; a DIFF's content is its stored chunks.
      if (record?.diff !== null || mention.contentVersionHash === null) return [];
      return [{ snapshotId: captureOf(record).id, textHash: mention.contentVersionHash }];
    }),
  );

  for (const mention of mentions) {
    const entry = byVersion.get(mention.versionId);
    if (entry === undefined) {
      // A LOUD GUARD, never a silent skip: `mentions` is filtered to `wanted` above, so a row naming anything
      // else means the filter is defective — and a citation quietly dropped here is a citation the centre
      // draws as `unresolved` with nothing to say why (`CLAUDE.md`, the `requireSnapshotIdentity` pattern).
      throw new Error(`publishedThesis: mention ${mention.id} names version ${mention.versionId}, which was not asked for.`);
    }
    entry.cited.push({ kind: mention.kind, name: mention.name, debate: mention.debateSession });
    if (mention.kind === 'TRAJECTORY') {
      const t = resolved.find((r) => r.id === mention.name);
      entry.citations.push(
        t === undefined
          ? { kind: 'TRAJECTORY', name: mention.name, resolves: false }
          : { kind: 'TRAJECTORY', name: mention.name, resolves: true, claimText: t.claimText, url: t.url, transitions: t.transitions, current: trajectoryCurrent(t.currency) },
      );
      continue;
    }
    if (mention.kind === 'DOCUMENT') {
      entry.citations.push(documentCitation(thesisId, mention, documents.get(mention.name) ?? null, flags));
      continue;
    }
    const record = records.get(mention.name) ?? null;
    if (record === null) {
      throw new Error(`publishedThesis: version ${mention.versionId} cites #ev_${mention.name}, which no record of the corpus resolves.`);
    }
    pages.set(record.page.url, record.page.id);
    entry.citations.push(evidenceCitation(thesisId, mention, record, reports, flags, held));
  }

  // The map `recordsByName` answers has an entry for every name asked for, `null` where the corpus derives
  // nothing — and the loop above has already thrown on any such name, so every entry here is a record.
  const resolvedRecords = new Map<string, ResolvedRecord>();
  for (const [name, record] of records) {
    if (record !== null) resolvedRecords.set(name, record);
  }
  return {
    byVersion,
    records: resolvedRecords,
    documents,
    pages: [...pages].map(([url, trackedUrlId]) => ({ trackedUrlId, url })),
    flags,
    trajectories: new Map(resolved.map((t) => [t.id, t.currency])),
  };
}

/**
 * The entry `citationsByVersion` promises for every id it was asked for — LOUD, never an empty list silently.
 *
 * A version resolved to no citations and a version the resolver never saw are different facts, and `?? []`
 * reports the second as the first: the centre would draw a text whose every chip is `unresolved` and say
 * nothing about why. Both callers reach the map through this.
 */
export function requireCitations(resolved: ResolvedCitations, versionId: string): VersionCitations {
  const entry = resolved.byVersion.get(versionId);
  if (entry === undefined) {
    throw new Error(`publishedThesis: no citations resolved for version ${versionId}, which citationsByVersion was asked for.`);
  }
  return entry;
}

/** One EVIDENCE citation resolved as T5 :812–:817 lists it, each fact from its own predicate. */
/**
 * ONE citation's shape, over answers ALREADY READ — this function makes no query at all.
 *
 * It takes the three plurals' maps rather than awaiting three singulars, which is what turns eight queries per
 * citation into none. It decides nothing differently: the pin, the record's shape, the two marks and the two
 * facts are composed exactly as before.
 */
function evidenceCitation(
  thesisId: string,
  mention: {
    id: string;
    name: string;
    contentVersionHash: string | null;
    debateSession: { status: string; recordFileHash: string; thesisId: string; promotedOverObjection: boolean } | null;
  },
  record: ResolvedRecord,
  reports: Map<string, VerifiedReport>,
  flags: Map<string, FlagReport>,
  held: Map<string, string>,
): EvidenceCitation {
  const pin = mention.contentVersionHash;
  if (pin === null) {
    throw new Error(`publishedThesis: the EVIDENCE citation ${mention.id} carries no pin — the version write computes one for every record.`);
  }
  const report = reports.get(mention.name);
  const flag = flags.get(mention.id);
  if (report === undefined || flag === undefined) {
    throw new Error(`publishedThesis: no VERIFIED or FLAGGED for the citation ${mention.id} — both maps answer for every key asked.`);
  }
  return {
    kind: 'EVIDENCE',
    name: mention.name,
    pin,
    record:
      record.diff === null
        ? { url: record.page.url, capture: captureOf(record).capture }
        : { url: record.page.url, before: record.diff.before.capture, after: record.diff.after.capture },
    content: pinnedContent(record, pin, held),
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

/**
 * One DOCUMENT citation, over answers ALREADY READ — no query. Its name, pin and argument as an EVIDENCE citation's
 * are composed (the pin is the mention's, computed by the version write), and its title and custody from the one
 * document read. A mention naming no document, or a shed one, THROWS by name: the version write refuses both, so
 * either is a row this design does not write — the SHED arm of FLAGGED(m) is document step 35's.
 */
function documentCitation(
  thesisId: string,
  mention: {
    id: string;
    name: string;
    contentVersionHash: string | null;
    debateSession: { status: string; recordFileHash: string; thesisId: string; promotedOverObjection: boolean } | null;
  },
  cited: CitedDocument | null,
  flags: Map<string, FlagReport>,
): DocumentCitationBase {
  const pin = mention.contentVersionHash;
  if (pin === null) {
    throw new Error(`publishedThesis: the DOCUMENT citation ${mention.id} carries no pin — the version write computes one for every document.`);
  }
  if (cited === null) {
    throw new Error(`publishedThesis: the DOCUMENT citation ${mention.id} names #doc_${mention.name}, which no document holds.`);
  }
  if (cited.custody === 'NONE') {
    throw new Error(`publishedThesis: the DOCUMENT citation ${mention.id} names #doc_${mention.name}, which was SHED — FLAGGED's SHED arm is document step 35's.`);
  }
  const flag = flags.get(mention.id);
  if (flag === undefined) {
    throw new Error(`publishedThesis: no FLAGGED for the citation ${mention.id} — the map answers for every key asked.`);
  }
  return {
    kind: 'DOCUMENT',
    name: mention.name,
    pin,
    argued: argued({ name: mention.name, thesisId, debate: mention.debateSession }),
    title: cited.document.title,
    custody: cited.custody,
    flag: { flagged: flag.flagged, reasons: flag.reasons },
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
/** The pinned content, over texts ALREADY READ — pure, so the citation path reaches no delegate. */
function pinnedContent(record: ResolvedRecord, pin: string, held: Map<string, string>): EvidenceCitation['content'] {
  const { diff } = record;
  if (diff !== null) {
    const version = diff.versions.find((v) => v.contentVersionHash === pin);
    if (version === undefined) {
      throw new Error(`publishedThesis: no content version ${pin} of the diff ${pairName(diff)} — a pin names a version the walk stored.`);
    }
    return { kind: 'DIFF', chunks: chunksOf(version.chunks, pairName(diff)).map((c) => ({ side: c.side, text: c.text })) };
  }
  const capture = captureOf(record);
  const text = held.get(heldTextKey(capture.id, pin));
  if (text === undefined) {
    throw new Error(`publishedThesis: capture ${capture.capture} holds no text at the pin ${pin} — a pin names a text the walk kept.`);
  }
  return { kind: 'CAPTURE', text };
}

