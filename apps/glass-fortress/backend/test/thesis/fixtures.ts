import { CURRENT_VERSION, DIFF_NAME, DIFF_ROW } from '../helpers/corpusFixture';
import type {
  DebateSessionRow,
  FramingRoundRow,
  FramingRow,
  NoteRow,
  PublicationAttemptRow,
  ThesisAnalysisRow,
  ThesisGapDecisionRow,
  ThesisMentionRow,
  ThesisRow,
  ThesisVersionRow,
  WithdrawalRow,
} from './contract';

// ---------------------------------------------------------------------------
// NAMED FIXTURES FOR THE THESIS ACCEPTANCE SUITE, on the corpus fixture's page.
//
// The corpus beneath a thesis is `test/helpers/corpusFixture.ts`'s — the page, its
// two captures, the pair and its CURRENT content version — IMPORTED, never
// re-spelled, so the record a thesis cites is the record the evidence suites
// name. Every row here is TYPED against `contract.ts`, A2's target.
//
// EVERY `createdAt` IS DISTINCT (L5). HISTORY is "every row naming t, in createdAt
// order" (thesis A3 :1407), and interaction A3 :927 records that rows written in
// ONE transaction share now(). A tie is step 20's question; no fixture creates
// one, and `test/thesis/loader.test.ts` holds that none does.
// ---------------------------------------------------------------------------

export const AUTHOR = 'researcher-author';
export const OTHER_RESEARCHER = 'researcher-other';

/** A distinct instant per row, from one base — by the minute, and by the second where a row sits between two — never two rows at one moment. */
const at = (minute: number, second = 0): Date => new Date(Date.UTC(2026, 8, 10, 9, minute, second));

export const PROVISION = 'NUREMBERG_1';
export const CLAIM =
  'משרד הבריאות הסיר מהעמוד את הפסקה על תופעות הלוואי בזמן שהצהיר בפומבי על בטיחות החיסון';

export const THESIS: ThesisRow = {
  id: 'thesis-1',
  provision: PROVISION,
  createdById: AUTHOR,
  headVersionId: 'version-1',
  publishedVersionId: null,
  publishedAt: null,
  publishedById: null,
  publicInterestStatement: null,
  createdAt: at(10),
};

export const FRAMING: FramingRow = {
  id: 'framing-1',
  question: 'האם הציבור קיבל את המידע על תופעות הלוואי בזמן אמת?',
  provision: PROVISION,
  researcherId: AUTHOR,
  thesisId: THESIS.id,
  fromRunId: null,
  clusterIndex: null,
  createdAt: at(1),
};

/** PROPOSED · ASSESSED · CHOSEN, in sequence — the shape CLAIM_FRAMED is true of. */
export const ROUNDS: readonly FramingRoundRow[] = [
  { id: 'round-1', framingId: FRAMING.id, sequence: 1, type: 'PROPOSED', content: { framing: CLAIM }, researcherId: AUTHOR, createdAt: at(2) },
  { id: 'round-2', framingId: FRAMING.id, sequence: 2, type: 'ASSESSED', content: {}, researcherId: AUTHOR, createdAt: at(3) },
  {
    id: 'round-3',
    framingId: FRAMING.id,
    sequence: 3,
    type: 'CHOSEN',
    content: { claim: CLAIM, provision: PROVISION, elements: [] },
    researcherId: AUTHOR,
    createdAt: at(4),
  },
];

/** The version's text cites the corpus fixture's DIFF record by its computed name. */
export const VERSION_TEXT = `כפי שהעמוד הראה בין 9 בדצמבר 2020 ל-12 ביוני 2021 #ev_${DIFF_NAME}\n`;

/**
 * THE TWO VECTORS, DERIVED OUTSIDE THE IMPLEMENTATION (round 2, Q3 — evidence 11b's
 * rule: a vector the code produced proves only that the code agrees with itself).
 * No sha256 is written in the test tree; these are literals, and
 * `test/thesis/loader.test.ts` holds DIFF_NAME_VECTOR against `recordId`'s answer.
 *
 * Derived at a zsh shell, 2026-09-10, with evidence A1's byte layout
 * (`CAPTURE_ID = sha256(utf8(url) ‖ 0x00 ‖ ascii(ts) ‖ 0x00 ‖ bytes32(documentHash))`,
 * `ID(DIFF) = sha256(bytes32(CAPTURE_ID(before)) ‖ bytes32(CAPTURE_ID(after)))`), and
 * the corpus fixture's inputs (`documentHash` = sha256 of 'before-bytes' / 'after-bytes'):
 *
 *   URL='https://news.walla.co.il/item/3403847'
 *   DB=$(printf '%s' 'before-bytes' | shasum -a 256 | cut -d' ' -f1)
 *   DA=$(printf '%s' 'after-bytes'  | shasum -a 256 | cut -d' ' -f1)
 *   CB=$( { printf '%s' "$URL"; printf '\x00'; printf '%s' '20201209134003'; printf '\x00';
 *           printf '%s' "$DB" | xxd -r -p; } | shasum -a 256 | cut -d' ' -f1)
 *   CA=$( { printf '%s' "$URL"; printf '\x00'; printf '%s' '20210612183110'; printf '\x00';
 *           printf '%s' "$DA" | xxd -r -p; } | shasum -a 256 | cut -d' ' -f1)
 *   DID=$( { printf '%s' "$CB" | xxd -r -p; printf '%s' "$CA" | xxd -r -p; } | shasum -a 256 | cut -d' ' -f1)
 *   TEXT="כפי שהעמוד הראה בין 9 בדצמבר 2020 ל-12 ביוני 2021 #ev_0x$DID"
 *   printf '%s\n' "$TEXT" | shasum -a 256          # the text is 149 bytes with its newline
 *
 *   CAPTURE_ID(before) 0xf86f4ae9de4e1cdaced5113655ffbed3299a0821eaa11b9b41038dc34b53636e
 *   CAPTURE_ID(after)  0x8135c02dc46ffb1c691fc7cec45024c316107c0649299c31304fcb908863568f
 *   DIFF_NAME          0xc58e2e74666eff48961f22d776734fe31d133bdc62875a64b032e17863ac1fad
 *   contentHash        0x3c4188aa2e6e608ada1ab5abf58bc58896cbf3231dc65c1d910917ecadf4b7a4
 *
 * Cross-checked with Python's `hashlib.sha256` over the same text: identical.
 */
export const DIFF_NAME_VECTOR = '0xc58e2e74666eff48961f22d776734fe31d133bdc62875a64b032e17863ac1fad';

export const VERSION: ThesisVersionRow = {
  id: 'version-1',
  thesisId: THESIS.id,
  parentVersionId: null,
  text: VERSION_TEXT,
  contentHash: '0x3c4188aa2e6e608ada1ab5abf58bc58896cbf3231dc65c1d910917ecadf4b7a4',
  claim: CLAIM,
  createdById: AUTHOR,
  createdAt: at(11),
};

/** The citation, pinned to the pair's CURRENT content version and not yet argued. */
export const MENTION: ThesisMentionRow = {
  id: 'mention-1',
  versionId: VERSION.id,
  kind: 'EVIDENCE',
  name: DIFF_NAME,
  contentVersionHash: CURRENT_VERSION.contentVersionHash,
  debateSessionId: null,
};

/**
 * A gap entered on THESIS and left OPEN — the one decision the tool worlds seed (7.3):
 * `decide_gap` decides it, `draft_foia_request` drafts for it, and the version write
 * reports it in `gapsNowOpen` once it is CITED and its citation leaves the text.
 *
 * ITS gapId IS A VECTOR DERIVED OUTSIDE THE IMPLEMENTATION (sketch §5f): the
 * description is §5f's input `b`, and gapId(b) was computed at a shell with Python's
 * `hashlib` over NORMALISE's output. No sha256 is written in the test tree, so a case
 * that enters this description as TEXT reaches this gap only if the code agrees with
 * the shell.
 */
export const OPEN_GAP: ThesisGapDecisionRow = {
  id: 'gap-decision-1',
  thesisId: THESIS.id,
  // The head at the decision (thesis T4 :628) — A2's row carries it since step 18.
  versionId: VERSION.id,
  gapId: '0xb7e3de92429f145655225b425edb907f0740fb6cad838ac5ee2de3b03678d8eb',
  description: 'מסמך הצגת הנתונים למשרד הבריאות לפני 5 באוגוסט 2022',
  sequence: 1,
  decision: 'OPEN',
  citedName: null,
  request: null,
  callItem: null,
  reason: null,
  researcherId: AUTHOR,
  createdAt: at(12),
};

/** §5f's input `a` — OPEN_GAP's description with its whitespace disordered; gapId(a) = gapId(b) at the shell. */
export const OPEN_GAP_DESCRIPTION_SPACED = '  מסמך הצגת הנתונים\n למשרד הבריאות\t לפני 5 באוגוסט 2022 ';

export const NOTE: NoteRow = {
  id: 'note-1',
  thesisId: THESIS.id,
  framingId: null,
  text: 'שבעה, לא חמישה',
  researcherId: AUTHOR,
  createdAt: at(13),
};

/**
 * THE VERSIONS AFTER VERSION — a CHAIN, never a tree (T2 :443–:449): VERSION →
 * TRAJECTORY_VERSION → NEXT_VERSION, each written against the head of its moment.
 * Added at 7.2 round 2 for REVIEWS, which reads HEAD(t) and PUBLISHED(t) apart
 * (A3 :1408–:1410): a case sets the thesis's two pointers onto different links of
 * this chain and holds the chain up to its head.
 *
 * TRAJECTORY_ID IS CUID-SHAPED because the token is `#tr_<cuid>` (A1 :1244), and a
 * version's text must be one the parser would read as the mention its rows claim.
 *
 * THEIR contentHash VALUES ARE DERIVED OUTSIDE THE IMPLEMENTATION, as VERSION's
 * is — at a zsh shell, `printf '%s\n' "$TEXT" | shasum -a 256` and the same bytes
 * through `openssl dgst -sha256`, then Python's `hashlib.sha256` over the texts
 * typed afresh; all three agree, and the same shell commands reproduce VERSION's
 * committed vector above (0x3c41…b7a4):
 *
 *   TRAJECTORY_VERSION  85 bytes  0xf3984e4797867c2c56c16e31926f122829c2a16242cd109f6574b97c3aa08aac
 *   NEXT_VERSION        78 bytes  0xd0a5d4c98672a0b16b76be353164e9d76bf762aabdf4e9c6b911b004e3cb5de3
 */
export const TRAJECTORY_ID = 'clx9trajectory00000000001';

/** Cites the trajectory, and no longer the diff VERSION cited. */
export const TRAJECTORY_VERSION_TEXT = `הטענה הוסרה מהעמוד ולא שוחזרה #tr_${TRAJECTORY_ID}\n`;

/** Cites nothing — the passage kept, every citation dropped. */
export const NEXT_VERSION_TEXT = 'כפי שהעמוד הראה בין 9 בדצמבר 2020 ל-12 ביוני 2021\n';

export const TRAJECTORY_VERSION: ThesisVersionRow = {
  id: 'version-2',
  thesisId: THESIS.id,
  parentVersionId: VERSION.id,
  text: TRAJECTORY_VERSION_TEXT,
  contentHash: '0xf3984e4797867c2c56c16e31926f122829c2a16242cd109f6574b97c3aa08aac',
  claim: CLAIM,
  createdById: AUTHOR,
  createdAt: at(15),
};

export const NEXT_VERSION: ThesisVersionRow = {
  id: 'version-3',
  thesisId: THESIS.id,
  parentVersionId: TRAJECTORY_VERSION.id,
  text: NEXT_VERSION_TEXT,
  contentHash: '0xd0a5d4c98672a0b16b76be353164e9d76bf762aabdf4e9c6b911b004e3cb5de3',
  claim: CLAIM,
  createdById: AUTHOR,
  createdAt: at(16),
};

/** TRAJECTORY_VERSION's one citation — a TRAJECTORY mention carries no pin (A2). */
export const TRAJECTORY_MENTION: ThesisMentionRow = {
  id: 'mention-2',
  versionId: TRAJECTORY_VERSION.id,
  kind: 'TRAJECTORY',
  name: TRAJECTORY_ID,
  contentVersionHash: null,
  debateSessionId: null,
};

/**
 * THE REST OF VERSION'S STORY, for HISTORY (7.2 round 3, M2): its citation argued,
 * the version criticised, published and withdrawn — four of A3 :1407's eight kinds,
 * each at its own instant between NOTE (09:13) and TRAJECTORY_VERSION (09:15), so
 * the chain above is what the author wrote after the withdrawal. THESIS's
 * `publishedVersionId` is null, as a withdrawal leaves it.
 */

/** The debate on VERSION's citation, PROMOTED for this record and this thesis — what evidence's `argued` reads. */
export const DEBATE: DebateSessionRow = {
  id: 'debate-1',
  thesisId: THESIS.id,
  researcherId: AUTHOR,
  recordFileHash: DIFF_NAME,
  recordSnapshotId: null,
  recordDiffId: DIFF_ROW.id,
  status: 'PROMOTED',
  createdAt: at(13, 20),
  closedAt: null,
};

/** An opinion on VERSION: a model and a prompt version, and no researcher (A2 :1313–:1318). */
export const ANALYSIS: ThesisAnalysisRow = {
  id: 'analysis-1',
  versionId: VERSION.id,
  inputFingerprint: 'fingerprint-of-version-1',
  opinion: {},
  model: 'critic-model',
  promptVersion: 'critic-v1',
  runAt: at(13, 40),
};

export const ATTEMPT: PublicationAttemptRow = {
  id: 'attempt-1',
  thesisId: THESIS.id,
  versionId: VERSION.id,
  rationale: 'הטיעון לפרסום הגרסה הזו',
  assessment: { substance: true, names: [] },
  verdict: 'SUPPORTS',
  outcome: 'PUBLISHED',
  refusedBy: [],
  researcherId: AUTHOR,
  createdAt: at(14, 20),
};

export const WITHDRAWAL: WithdrawalRow = {
  id: 'withdrawal-1',
  thesisId: THESIS.id,
  versionId: VERSION.id,
  reason: 'ציטוט שנמצא שגוי',
  researcherId: AUTHOR,
  createdAt: at(14, 40),
};

/**
 * A HEAD CITING BOTH KINDS — the diff VERSION cites AND the trajectory
 * TRAJECTORY_VERSION cites (7.4). The gate's checks 11 and 12 must each fail ALONE,
 * and a version citing a trajectory and no record would fail CITES_EVIDENCE beside
 * them. Its contentHash is a vector derived OUTSIDE the implementation, as the
 * others are: at a zsh shell, `printf '%s\n' "$TEXT"` through `shasum -a 256` and
 * through `openssl dgst -sha256`, and Python's `hashlib.sha256` over the text typed
 * afresh — all three agree, and a one-character control differs:
 *
 *   CITING_BOTH_VERSION  197 bytes  0x915cb427e2c61b9df1a1197ea58a0cdc3d0d7fba909ec4153de90084d33f1ec1
 */
export const CITING_BOTH_TEXT = `כפי שהעמוד הראה בין 9 בדצמבר 2020 ל-12 ביוני 2021 #ev_${DIFF_NAME} ולא שוחזר #tr_${TRAJECTORY_ID}\n`;

export const CITING_BOTH_VERSION: ThesisVersionRow = {
  id: 'version-4',
  thesisId: THESIS.id,
  parentVersionId: NEXT_VERSION.id,
  text: CITING_BOTH_TEXT,
  contentHash: '0x915cb427e2c61b9df1a1197ea58a0cdc3d0d7fba909ec4153de90084d33f1ec1',
  claim: CLAIM,
  createdById: AUTHOR,
  createdAt: at(17),
};

/** CITING_BOTH_VERSION's two citations: the diff at CURRENT's pin, not yet argued, and the trajectory (no pin). */
export const BOTH_EVIDENCE_MENTION: ThesisMentionRow = { ...MENTION, id: 'mention-3', versionId: CITING_BOTH_VERSION.id };
export const BOTH_TRAJECTORY_MENTION: ThesisMentionRow = {
  ...TRAJECTORY_MENTION,
  id: 'mention-4',
  versionId: CITING_BOTH_VERSION.id,
};

/** Every fixture row that carries a `createdAt` — what the distinctness case reads; an analysis's instant is its `runAt`. */
export const DATED_ROWS: readonly { id: string; createdAt: Date }[] = [
  THESIS,
  FRAMING,
  ...ROUNDS,
  VERSION,
  OPEN_GAP,
  NOTE,
  DEBATE,
  { id: ANALYSIS.id, createdAt: ANALYSIS.runAt },
  ATTEMPT,
  WITHDRAWAL,
  TRAJECTORY_VERSION,
  NEXT_VERSION,
  CITING_BOTH_VERSION,
];
