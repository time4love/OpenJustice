import type {
  Conjunct,
  ConjunctId,
  ConjunctReason,
  ExaminedMention,
  PublishableReport,
  VersionPublishableReport,
} from '../../src/services/evidencePredicates';
import * as trajectoryCitation from '../../src/services/trajectoryCitation';
import type { ResolvedTrajectoryCitation, TrajectoryCurrency } from '../../src/services/trajectoryCitation';
import { AFTER, BEFORE, CURRENT_VERSION, DIFF_NAME, DIFF_ROW, PAGE, URL, anchorCheck } from '../helpers/corpusFixture';
import { store, type Row } from '../helpers/evidenceDouble';
import { built } from './absent';
import type {
  FramingRoundRow,
  FramingRoundType,
  Fingerprinted,
  GapDecisionValue,
  PublicationAssessment,
  ThesisAnalysisRow,
  ThesisGapDecisionRow,
  ThesisMentionRow,
  ThesisPredicatesModule,
  ThesisVersionRow,
} from './contract';
import {
  AUTHOR,
  BOTH_EVIDENCE_MENTION,
  BOTH_TRAJECTORY_MENTION,
  CLAIM,
  DEBATE,
  FRAMING,
  MENTION,
  OPEN_GAP,
  PROVISION,
  ROUNDS,
  THESIS,
  TRAJECTORY_MENTION,
  VERSION,
} from './fixtures';
import { mentionRow } from './rows';

// ---------------------------------------------------------------------------
// PUBLISHABLE(v)'s WORLD — the R40 sketch §2's fixtures, ONE spelling for
// `derivations.test.ts` (A3's predicate) and `gate.test.ts` (A6's gate).
//
// MOVED OUT OF `derivations.test.ts` AT 7.4, when §4's agreement case — "the gate
// and PUBLISHABLE(v) agree on every fixture of §2" — needed the SAME fixtures. An
// agreement run over a copy is an agreement with the copy, free to drift from the
// cases it claims to agree with. The helpers the predicate cases also use (`at`,
// `round`, `gap`, `analysis`, `diffRecord`, the trajectory currencies) came with it.
//
// THE CURRENT ANALYSIS IS SEEDED OVER THIS WORLD'S OWN INPUTS (7.4). At 7.2 the
// fingerprint was computed over a DISMISSED gap whatever `gaps` a case seeded, so
// "a gap reading OPEN" also moved the fingerprint and left the analysis stale beside
// it — two conjuncts false where the case claims one, invisible until step 23
// builds `publishableVersion`. Now the fingerprint reads the version, its citations
// and the gap decisions the world actually holds.
// ---------------------------------------------------------------------------

export const at = (hour: number, minute: number, second = 0): Date => new Date(Date.UTC(2026, 8, 10, hour, minute, second));

export const round = (sequence: number, type: FramingRoundType, content: unknown, framingId = FRAMING.id): FramingRoundRow => ({
  id: `round-${framingId}-${String(sequence)}`,
  framingId,
  sequence,
  type,
  content,
  researcherId: AUTHOR,
  createdAt: at(8, sequence),
});

export const CHOSEN = { claim: CLAIM, provision: PROVISION, elements: [] };

/** OPEN_GAP's id — the sketch §5f shell vector, whose one literal is in `fixtures.ts`. */
export const GAP_ID = OPEN_GAP.gapId;

export const capture = (row: { textHash: string; textExtractionVersion: string }) => ({
  textHash: row.textHash,
  textExtractionVersion: row.textExtractionVersion,
});

export const diffRecord = (versions: readonly (typeof CURRENT_VERSION)[] = [CURRENT_VERSION], after = capture(AFTER)) => ({
  kind: 'DIFF' as const,
  before: capture(BEFORE),
  after,
  versions,
});

export const defined = (f: Fingerprinted): string => {
  if (!f.defined) throw new Error(`FINGERPRINT undefined: ${f.reason} for ${f.name}`);
  return f.fingerprint;
};

export const analysis = (inputFingerprint: string, versionId = VERSION.id): ThesisAnalysisRow => ({
  id: `analysis-${versionId}-${inputFingerprint}`,
  versionId,
  inputFingerprint,
  opinion: {},
  model: 'critic-model',
  promptVersion: 'critic-v1',
  runAt: at(9, 30),
});

export const gap = (sequence: number, decision: GapDecisionValue, over: Partial<ThesisGapDecisionRow> = {}): ThesisGapDecisionRow => ({
  id: `gap-${String(sequence)}-${decision}`,
  thesisId: THESIS.id,
  gapId: GAP_ID,
  description: OPEN_GAP.description,
  sequence,
  decision,
  citedName: null,
  request: null,
  callItem: null,
  reason: null,
  researcherId: AUTHOR,
  createdAt: at(10, sequence),
  ...over,
});

/**
 * The trajectory service's four states, one of each — a RECORD over the union's own
 * discriminant, so a fifth state added to `TrajectoryCurrency` fails the compile
 * rather than arriving unmapped.
 */
export const CURRENCIES: Record<TrajectoryCurrency['state'], TrajectoryCurrency> = {
  PINNED_IS_LATEST: { state: 'PINNED_IS_LATEST', computedAt: '2026-09-01T00:00:00.000Z' },
  RECOMPUTED_AGREES: {
    state: 'RECOMPUTED_AGREES',
    latestComputationId: 'computation-2',
    latestComputedAt: '2026-09-05T00:00:00.000Z',
    latestSnapshotsExamined: 9,
  },
  RECOMPUTED_DISAGREES: {
    state: 'RECOMPUTED_DISAGREES',
    latestComputationId: 'computation-2',
    latestComputedAt: '2026-09-05T00:00:00.000Z',
    latestSnapshotsExamined: 9,
    difference: 'the claim was restored',
    latestFinalState: 'PRESENT',
    latestFlips: [],
  },
  NOT_FOLLOWED_BY_LATEST: {
    state: 'NOT_FOLLOWED_BY_LATEST',
    latestComputationId: 'computation-2',
    latestComputedAt: '2026-09-05T00:00:00.000Z',
  },
};

/** A cited trajectory as the ONE resolver returns it, carrying the currency a case names. */
const resolvedAt = (id: string, currency: TrajectoryCurrency): ResolvedTrajectoryCitation => ({
  id,
  claimHash: `claim-of-${id}`,
  claimText: 'הקישור לדיווח על תופעות לוואי',
  url: URL,
  trackedUrlId: PAGE.id,
  observations: [],
  changes: [],
  transitions: 2,
  firstSeen: '2020-12-09',
  lastSeen: '2021-06-12',
  finalState: 'REMOVED',
  computation: {
    id: 'computation-1',
    sourceStateHash: 'state-1',
    detectionVersion: 'v3',
    computedAt: '2026-09-01T00:00:00.000Z',
    snapshotsExamined: 9,
  },
  coMovement: { patternHash: 'pattern-1', claimCount: 1, members: [{ id, claimText: 'הקישור', cited: true }] },
  currency,
  caveat: trajectoryCitation.TRAJECTORY_EXTRACTION_CAVEAT,
});

/**
 * STALE_TRAJECTORY is TRAJECTORY_CURRENT over the currency the trajectory service
 * computes, and that service's one entry is `resolveTrajectoryCitations` (sketch
 * §2). STUBBED AT THAT SYMBOL: the four states are `test/trajectoryCitation.test.ts`'s
 * to derive, and a caller that re-derived a currency instead of asking the resolver
 * would meet a table the double does not hold for it — so the stub doubles as the
 * call proof its builder owes.
 */
export const trajectoriesAre = (currency: TrajectoryCurrency) =>
  jest
    .spyOn(trajectoryCitation, 'resolveTrajectoryCitations')
    .mockImplementation((ids) =>
      Promise.resolve({ resolved: [...new Set(ids)].map((id) => resolvedAt(id, currency)), missing: [] }),
    );

/** No pass stored the cited trajectory: the ONE resolver answers it MISSING (7.4, check 11). */
export const trajectoriesUnresolved = () =>
  jest
    .spyOn(trajectoryCitation, 'resolveTrajectoryCitations')
    .mockImplementation((ids) => Promise.resolve({ resolved: [], missing: [...new Set(ids)] }));

// --- the citations a version's text makes, row for row ---------------------------

/** Every mention fixture — so a version's mentions are READ from its id, never re-listed per case. */
const MENTIONS: readonly ThesisMentionRow[] = [MENTION, TRAJECTORY_MENTION, BOTH_EVIDENCE_MENTION, BOTH_TRAJECTORY_MENTION];

export const mentionsOf = (version: ThesisVersionRow): ThesisMentionRow[] => MENTIONS.filter((m) => m.versionId === version.id);

const evidenceMentionsOf = (version: ThesisVersionRow): ThesisMentionRow[] =>
  mentionsOf(version).filter((m) => m.kind === 'EVIDENCE');

const trajectoryIdsOf = (version: ThesisVersionRow): string[] =>
  mentionsOf(version)
    .filter((m) => m.kind === 'TRAJECTORY')
    .map((m) => m.name);

// --- the evidence half, as `publishableEvidence` could report it ------------------
//
// EACH STUB IS A REPORT `publishableEvidence` COULD RETURN (7.2 round 2): the
// mentions it examined, their six conjuncts, and a `mentionsExamined` that agrees
// with the list.

/** What `publishableEvidence` names a mention it examined (A6 :1201). */
const examinedOf = (mention: ThesisMentionRow): ExaminedMention => ({
  mentionId: mention.id,
  fileHash: mention.name,
  contentVersionHash: mention.contentVersionHash,
});

/** The version's one citation, as `publishableEvidence` names what it examined. */
export const EXAMINED: ExaminedMention = examinedOf(MENTION);

export const conjunct = (id: ConjunctId, verdict: Conjunct['verdict'] = 'PASS', reason: ConjunctReason | null = null): Conjunct => ({
  id,
  verdict,
  reason,
  detail: reason,
});

/** A3's five clauses and A6's promoted precondition, every one a PASS. */
export const SIX_PASS: readonly Conjunct[] = (
  ['RECORD_PROMOTED', 'ARGUED', 'VERIFIED', 'CITATION_CURRENT', 'DERIVED', 'INPUT_SOUND'] as const
).map((id) => conjunct(id));

/** Every EVIDENCE citation of `version` examined, and each of its six conjuncts a PASS. */
export const evidencePasses = (version: ThesisVersionRow): VersionPublishableReport => {
  const examined = evidenceMentionsOf(version).map(examinedOf);
  return {
    evaluable: true,
    versionId: version.id,
    mentionsExamined: examined.length,
    publishable: true,
    mentions: examined.map((e): PublishableReport => ({ evaluable: true, examined: e, publishable: true, conjuncts: [...SIX_PASS] })),
  };
};

export const EVIDENCE_PASSES: VersionPublishableReport = evidencePasses(VERSION);

/** The cited record was WITHDRAWN: RECORD_PROMOTED fails, and nothing else does. */
export const EVIDENCE_FAILS: VersionPublishableReport = {
  evaluable: true,
  versionId: VERSION.id,
  mentionsExamined: 1,
  publishable: false,
  mentions: [
    {
      evaluable: true,
      examined: EXAMINED,
      publishable: false,
      conjuncts: SIX_PASS.map((c) => (c.id === 'RECORD_PROMOTED' ? conjunct(c.id, 'FAIL', 'WITHDRAWN') : c)),
    },
  ],
};

/**
 * A DOCUMENT citation that failed nothing: four conjuncts examined none, so the
 * report cannot be graded. NO VERSION IN THIS TREE CAN CITE ONE — `#doc_` is
 * document step 33's — so the mention this stub names is not the fixture
 * version's; it is the one shape of the state, stated whole.
 */
export const DOCUMENT_EXAMINED: ExaminedMention = {
  mentionId: 'mention-document',
  fileHash: `0x${'dc'.repeat(32)}`,
  contentVersionHash: `0x${'de'.repeat(32)}`,
};

export const EVIDENCE_NOT_EVALUABLE: VersionPublishableReport = {
  evaluable: false,
  versionId: VERSION.id,
  mentionsExamined: 1,
  reason: 'DOCUMENT_CLASS_NOT_BUILT',
  notEvaluable: [DOCUMENT_EXAMINED],
  mentions: [
    {
      evaluable: false,
      examined: DOCUMENT_EXAMINED,
      reason: 'DOCUMENT_CLASS_NOT_BUILT',
      conjuncts: SIX_PASS.map((c) =>
        c.id === 'RECORD_PROMOTED' || c.id === 'ARGUED' ? c : conjunct(c.id, 'EXAMINED_NONE', 'DOCUMENT_CLASS_NOT_BUILT'),
      ),
    },
  ],
};

// --- the world ---------------------------------------------------------------------

export const DECIDED = gap(1, 'DISMISSED', { reason: 'לא רלוונטי' });

/** The assessor's answer every conjunct passes on, and check 17 too: substance, no names, claims framed as allegations. */
export const PASSING: PublicationAssessment = { substance: true, names: [], allegationsFramed: true };

/** VERSION's citation as the double's delegates read it, unargued and unpublished. */
export const MENTION_ROW: Row = mentionRow(MENTION, false);

export interface PublishableSeed {
  statement?: string | null;
  rounds?: readonly FramingRoundRow[];
  gaps?: readonly ThesisGapDecisionRow[];
  analysed?: boolean;
  /** The version graded, made HEAD — VERSION, citing the diff alone, unless a case names another. */
  version?: ThesisVersionRow;
  /** The head IS the published version — what the gate's HEAD_VERSION fails on (7.4). */
  publishedAtHead?: boolean;
}

/**
 * The world every conjunct of PUBLISHABLE(v) is true of, save what `over` breaks:
 * the thesis with a public-interest statement, its framing CHOSEN after an ASSESSED
 * round, a decided gap, the version's citations, its record PROMOTED, and the
 * analysis whose fingerprint is the version's now — computed by the ONE symbol over
 * this world's own inputs (one decision per gap in every world here), never guessed.
 */
export async function seedPublishable(over: PublishableSeed = {}): Promise<ThesisPredicatesModule> {
  const p = await built<ThesisPredicatesModule>('services/thesisPredicates', [
    'publishableVersion',
    'fingerprint',
    'CRITIC_PROMPT_VERSION',
  ]);
  const version = over.version ?? VERSION;
  const gaps = over.gaps ?? [DECIDED];
  const thesis = {
    ...THESIS,
    headVersionId: version.id,
    publicInterestStatement: over.statement === undefined ? 'עניין ציבורי מובהק' : over.statement,
    ...(over.publishedAtHead === true ? { publishedVersionId: version.id, publishedAt: at(9, 40), publishedById: AUTHOR } : {}),
  };
  store.thesis = thesis;
  store.theses = [thesis];
  store.versions = [version];
  store.framings = [FRAMING];
  store.framingRounds = [...(over.rounds ?? ROUNDS)];
  store.gapDecisions = [...gaps];
  store.mentions = mentionsOf(version).map((m) => mentionRow(m, over.publishedAtHead === true));
  store.evidenceRows = [{ fileHash: DIFF_NAME, kind: 'DIFF', status: 'PROMOTED', snapshot: null, urlVersionDiff: DIFF_ROW }];
  const fingerprint = defined(
    p.fingerprint({
      contentHash: version.contentHash,
      evidence: evidenceMentionsOf(version).map((m) => ({ name: m.name, record: diffRecord() })),
      trajectoryIds: trajectoryIdsOf(version),
      gaps: gaps.map((g) => ({ gapId: g.gapId, decision: g.decision })),
      promptVersion: p.CRITIC_PROMPT_VERSION,
    }),
  );
  store.analyses = over.analysed === false ? [] : [analysis(fingerprint, version.id)];
  return p;
}

/**
 * THE EVIDENCE HALF AS THE BUILT MODULE READS IT, un-stubbed (7.4): VERSION's citation
 * argued in DEBATE, the record PROMOTED over its two captures, each capture carrying
 * a stored anchor verdict — `test/evidence/evidenceChecks.test.ts`'s passing shape,
 * on the thesis fixtures. What the gate's rows 5–10 are held equal to.
 */
export function seedEvidenceHalf(): void {
  const withPage = (c: typeof BEFORE): Row => ({ ...c, trackedUrl: { url: URL } });
  store.mentions = [mentionRow(MENTION, false, DEBATE)];
  store.debates = [{ ...DEBATE }];
  store.evidenceRows = [
    {
      fileHash: DIFF_NAME,
      kind: 'DIFF',
      status: 'PROMOTED',
      snapshotId: null,
      snapshot: null,
      urlVersionDiffId: DIFF_ROW.id,
      urlVersionDiff: {
        id: DIFF_ROW.id,
        beforeSnapshot: withPage(BEFORE),
        afterSnapshot: withPage(AFTER),
        contentVersions: [CURRENT_VERSION],
      },
    },
  ];
  store.integrityChecks = [anchorCheck(BEFORE.id), anchorCheck(AFTER.id)];
}

/**
 * §2's PUBLISHABLE(v) row, each THESIS conjunct ALONE false — `derivations.test.ts`
 * holds the predicate naming each, and `gate.test.ts`'s agreement runs over the same
 * rows (7.4).
 */
export const CONJUNCTS_ALONE: readonly (readonly [string, PublishableSeed, PublicationAssessment, string])[] = [
  ['a claim no assessed round chose', { rounds: [round(1, 'PROPOSED', { framing: CLAIM }), round(2, 'CHOSEN', CHOSEN)] }, PASSING, 'CLAIM_FRAMED'],
  ['no CURRENT analysis', { analysed: false }, PASSING, 'ANALYSIS_CURRENT'],
  ['a gap reading OPEN', { gaps: [gap(1, 'OPEN')] }, PASSING, 'GAPS_DECIDED'],
  ['no public-interest statement', { statement: null }, PASSING, 'PUBLIC_INTEREST_STATEMENT'],
  ['a rationale without substance', {}, { ...PASSING, substance: false }, 'RATIONALE_SUBSTANCE'],
  ['an assessment that names a person', {}, { ...PASSING, names: ['ישראל ישראלי'] }, 'NAMES_NO_PERSON'],
];
