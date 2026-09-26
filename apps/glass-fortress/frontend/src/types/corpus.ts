import type { ChunkSide } from './record';

// ---------------------------------------------------------------------------
// THE CORPUS BODIES — hand-written from the appendix, never from a live response.
//
// GROUND: docs/gf-evidence-flows.md A4 :1081–:1090 (the capture row and the diff row), :1095–:1099
// (`get_diff_input`), :1105–:1109 (`resolve_record`), :1111–:1115 (`check_on_chain_status`);
// docs/gf-ui-flows.md §6.1 :237–:243 (`list_corpus`' envelope and its order) and §28 :747–:755 (the `pages`
// facet). Plan §4 :880–:883: a fixture is written from the appendix so it asserts what the CONTRACT says,
// not what one environment happened to answer on one day — and these types are the same discipline.
//
// WHERE THIS FILE GOES BEYOND THE APPENDIX IT SAYS SO, on the field. Three fields are carried here that A4's
// rows do not name, each because another clause requires them; all three are reported as owed amendments and
// none is invented:
//
//   · `kind` — A4 describes `list_findings`, which returns captures and diffs in TWO ARRAYS. `list_corpus`
//     returns ONE `entries` array (§6.1 :238) holding "capture row | diff row", so the union needs a
//     discriminant and A4 names none. Without it the array cannot be read at all.
//   · `fileHash` on both rows — a row links to `/records/[fileHash]` (§26 :726) and a capture IS a record
//     (evidence §1), so both kinds carry the name the record page resolves.
//   · `evidence` on a CAPTURE row — A4 gives `evidence` to the diff row only, but §6.1 :240 says `cited`
//     "keeps the ENTRIES with `evidence` ≠ null" without restricting the kind, and the RECORDS lens
//     (§25 :699–:702) is that filter over the stream.
//
// NO ID IS EVER RENDERED FROM THESE TYPES (§4 :167). `capture` is a 14-digit wayback timestamp, `fileHash`
// and `textHash` are 64-hex, `trackedUrlId` is an id: each has exactly two homes, a COPY control and a
// VERIFY disclosure. A type carries them because the READ does; a page never reads them aloud.
// ---------------------------------------------------------------------------

/** `list_corpus`' two scopes (§6.1 :237). `public` is every opened page; `all` is UI-8's, gated. */
export type CorpusScope = 'public' | 'all';

/** The discriminant of the one `entries` array — see the header: required by §6.1, unnamed by A4. */
export type EntryKind = 'CAPTURE' | 'DIFF';

/**
 * THE SEVEN INVESTIGATIVE CATEGORIES, as `opinion.categories` carries them.
 *
 * THEY ARE DECLARED HERE AND NOT IMPORTED, and that is a deliberate trade with one guard on it.
 * `src/lib/investigativeCategories.ts` holds the same seven today, but UI-7 REPLACES that module and UI-10
 * retires it (plan :660, :883) — it carries raw Tailwind colours (`bg-purple-50`), which the palette rule
 * forbids outside `globals.css`'s token block, and every one of its importers is a retired page. A corpus
 * body's own enum may not depend on a module that is on its way out, so the members live with the body.
 * `corpus-categories-are-the-landed-seven` holds the two lists EQUAL until that module goes, so the pair
 * cannot drift in the meantime; that case is deleted with the module, not before.
 *
 * THE HEBREW LABELS ARE NOT HERE AND NEED NO NEW HOME: they are already in `messages/{he,en}.json` under
 * `categories.*`, all seven, both locales, and they outlive the module that pointed at them.
 */
export const INVESTIGATIVE_CATEGORIES = [
  'WITHHOLDING_INFORMATION',
  'INFORMED_CONSENT',
  'COERCION_MANDATE',
  'EXPERIMENTAL_STATUS_CONCEALMENT',
  'SAFETY_CLAIM_ALTERATION',
  'STATISTICAL_MANIPULATION',
  'ACCOUNTABILITY_EROSION',
] as const;

export type InvestigativeCategory = (typeof INVESTIGATIVE_CATEGORIES)[number];

/** The page a row belongs to (§6.1 :238; `public` added by UI-2, always true at `scope: 'public'`). */
export interface CorpusPage {
  trackedUrlId: string;
  url: string;
  public: boolean;
}

/**
 * One DAY of the page's captures, merged (§24 :755) — `day` is `YYYYMMDD`, eight digits.
 *
 * THE UNIT IS THE DAY BECAUSE THE STRIP'S UNIT IS THE DAY: `timeStrip`'s own `dayOf` reads the first eight
 * characters of a capture's 14-digit archive name and discards the rest, so an instant on the wire would be
 * precision the instrument throws away.
 */
export interface CaptureBin {
  day: string;
  /** How many CAPTURES fell on that day — never how many bins, which is what a merged mark must still sum. */
  count: number;
  /** ANY capture in the bin carries its own `evidence` — ruling (c)'s reading, and (e)'s ring on a merge. */
  cited: boolean;
}

/** One `(before-day, after-day)` pair's diffs, merged — both `YYYYMMDD`. */
export interface DiffBin {
  before: string;
  after: string;
  count: number;
  /** THE BIN'S MAXIMUM chunk count, never their sum (ruling (e)): a sum draws a magnitude no change has. */
  chunks: number;
  /** ANY diff in the bin passed the significance gate — the tone mirrors the ring's ANY, for (g)'s reason. */
  passed: boolean;
}

/**
 * ONE PAGE'S WHOLE SHAPE OVER TIME — what region 3's strip is drawn from, and the page's, never the view's.
 *
 * IT CARRIES DAYS AND NEVER GEOMETRY (§24 :755). No pixels, no midpoint, no merge: those are the drawing's
 * and they live in `lib/timeStrip.ts`. What the wire owns is WHAT HAPPENED; what the component owns is where
 * it lands.
 */
export interface PageShape {
  captures: CaptureBin[];
  diffs: DiffBin[];
}

/** One row of the `pages` FACET (§28 :751–:753) — the pages list's only legal source at `public`. */
export interface PagesFacetRow extends CorpusPage {
  /**
   * The first and last snapshot dates in scope — an INTERVAL, which is how a page is shown (§4 :169).
   *
   * BOTH ARE NULLABLE AND ALWAYS WERE ON THE WIRE (`corpusReads.ts` :1070–:1071, :1307 `held.at(0) ?? null`).
   * This type required `string` and `corpusBody`'s parser called `text()` on them, which THROWS — so ONE
   * surveyed page with no captures yet would have taken region 0 of the gated door down, and it parses every
   * surveyed page. That state is one survey away: `walk/tools/surveyWaybackCaptures.ts` :149 creates the
   * `TrackedUrl` and its work-list rows, and a LATER step acquires the captures.
   *
   * THE BACKEND DOES NOT MOVE (ruled 2026-09-21). `null` is the true statement about a page with no captures;
   * a `''` or a stand-in date would be a lie this side could not detect. What draws from them asks
   * `lib/pageInterval.ts` first, and a row with no interval says the url and its record count and stops.
   */
  first: string | null;
  last: string | null;
  /** How many records the scope holds for this page. */
  entries: number;
  /**
   * The page's shape over time, PRESENT ONLY ON THE PAGE A READ NAMES and `null` on every other row.
   *
   * IT IS THE STRIP'S ONLY SOURCE (§24 :755, ruled 2026-09-21). The card's text line was already the facet's
   * while its strip was built from the FILTERED, cursor-windowed entries, so one element contradicted itself:
   * measured on the real corpus, `?page=<corona>` drew „43 רשומות" over 16 dots and 16 bars, `&kind=DIFF`
   * the same line over an empty half. The facet is computed BEFORE the filter and before the cursor's slice,
   * so a shape read from here cannot be narrowed by either — and `null` draws NO strip rather than a partial
   * one, which is a loud absence instead of a silent half.
   */
  shape: PageShape | null;
}

/** A capture's anchor (A4 :1083–:1084). `attributed` is the ATTRIBUTED mark; it is never a failure. */
export interface Anchor {
  documentHash: string;
  attributed: boolean;
}

/** A published version that cites a record (A4 :1089–:1090) — `citedBy` lists PUBLISHED versions only. */
export interface CitingVersion {
  thesisId: string;
  published: boolean;
}

/** The record a row was promoted to, or `null` (A4 :1089–:1090). The RECORDS lens is `evidence ≠ null`. */
export interface EvidenceLink {
  fileHash: string;
  status: string;
  citedBy: CitingVersion[];
}

/**
 * One chunk of a diff's CURRENT content, by side (§24 :661–:662, "chunks by side, from `current`").
 * A4 :1086 names `chunks` and not its members, so `side` and `text` are read from §24's own description of
 * what a card shows; `survival` is OPTIONAL because no clause in UI-7's contract requires it.
 */
export interface DiffChunk {
  side: ChunkSide;
  text: string;
  survival?: string;
}

/** A diff's CURRENT content version (A4 :1086). */
export interface CurrentContent {
  contentVersionHash: string;
  chunks: DiffChunk[];
}

/**
 * THE CLASSIFIER'S OPINION (A4 :1087–:1088) — "LABELLED as opinion", and the ONLY model voice on any public
 * page (§24 :668–:670). Every field here renders inside `LabelledOpinion` or not at all;
 * `opinion-labelled-on-corpus` holds exactly that.
 */
export interface ClassifierOpinion {
  significance: string;
  categories: InvestigativeCategory[];
  legallySignificant: boolean;
  /**
   * A BOOLEAN, corrected 2026-09-19 from `string | null`. A4 :1086 names the field and does not type it, so
   * chunk 1 hand-wrote it as prose — and the fixture written from the same reading kept the whole suite green
   * over it. TWO independent sources say otherwise: the running backend answers `editorial: true`, and §24's
   * own measurement is written in the same shape — "20 carry `editorial: true`". Found when the stream's
   * first reading of a REAL body 500'd at the boundary, which is the parser doing its job.
   */
  editorial: boolean;
  classifierVersion: string;
  /**
   * A NUMBER, corrected 2026-09-19 alongside `editorial` and for the same reason: A4 :1086 names the field
   * without typing it, chunk 1 hand-wrote it as prose, and the running backend answers `draws: 1`. Both were
   * found by the stream's first reading of a REAL body, one after the other, each by the parser failing loudly
   * and naming its field — which is what a boundary narrowing is for.
   */
  draws: number;
}

/** A CAPTURE row (A4 :1082–:1084, plus the three fields the header names). */
export interface CaptureEntry {
  kind: 'CAPTURE';
  /** The 14-digit wayback timestamp. NEVER rendered as text (§4 :167). */
  capture: string;
  snapshotDate: string;
  fileHash: string;
  textHash: string;
  textExtractionVersion: string;
  anchor: Anchor;
  evidence: EvidenceLink | null;
  page: CorpusPage;
}

/** A DIFF row (A4 :1085–:1090, plus the three fields the header names). */
export interface DiffEntry {
  kind: 'DIFF';
  /** The two endpoints, each a 14-digit wayback timestamp; a diff is named by its PAIR, never by a date pair. */
  before: string;
  after: string;
  fileHash: string;
  current: CurrentContent | null;
  awaitingDerivation: boolean;
  opinion: ClassifierOpinion | null;
  narrowed: boolean;
  evidence: EvidenceLink | null;
  page: CorpusPage;
}

export type CorpusEntry = CaptureEntry | DiffEntry;

/**
 * `list_corpus`' answer (§6.1 :238–:241 with §28's facet).
 * Entries are in TIMESTAMP order across pages and NO OTHER ORDER EXISTS (A4 :1091) — the page offers none.
 */
export interface CorpusAnswer {
  entries: CorpusEntry[];
  pages: PagesFacetRow[];
  nextCursor: string | null;
}

/**
 * ONE CAPTURE OF A CLAIM'S VECTOR (§6.1 :248) — where the claim stood at one capture.
 *
 * `waybackTimestamp` is a 14-digit archive name and is NEVER rendered as text (§4 :167): the strip carries
 * it in a `data-` attribute and the sheet's link puts it in an href. `snapshotUrl` is deliberately NOT in
 * this type — the read does not send it, and `lib/archiveUrl.ts` is where the archive's address is made.
 */
export interface TrajectoryCapture {
  snapshotDate: string;
  waybackTimestamp: string;
  present: boolean;
}

/**
 * ONE SPAN OF STATE (§6.1 :248) — a run of consecutive captures in which the claim held one state.
 *
 * IT NAMES ITS FIRST CAPTURE AND COUNTS THE REST, and that is why `TrajectoryCapture[]` exists beside it:
 * a strip drawn from spans has one tick per FLIP (4 for the real page's 22 captures), and the diff a claim
 * left in is the pair (last capture of span i, first capture of span i+1) — a capture no span names.
 *
 * `days` IS NULLABLE AND IS A BOUND, NOT A DURATION (the backend's own words): it measures to the capture
 * that ENDED the state, and the true change point lies inside that window. `null` when a date will not
 * parse — a missing figure, never a zero.
 */
export interface TrajectorySpan extends TrajectoryCapture {
  snapshotUrl: string;
  captures: number;
  days: number | null;
  openEnded: boolean;
}

/**
 * ONE TRAJECTORY ROW of `list_trajectories` (§6.1 :248) — a group of claims that moved as one unit.
 *
 * `patternHash`, `sourceStateHash`, `claimHash` and `trajectoryId` are ids and NEVER text (§4 :167).
 * `trajectoryId` has the one home §4 :171–:173 gives it: a COPY control carrying `#tr_<trajectoryId>`.
 *
 * `claimCount` IS `claims.length` ON THE WIRE and is carried anyway, because it is the read's own count and
 * a page that recomputed it would be deriving a number it was handed. 13 of the real page's 26 rows are
 * groups, from 2 to 45 claims.
 */
export interface TrajectoryEntry {
  patternHash: string;
  sourceStateHash: string;
  transitions: number;
  firstSeen: string;
  lastSeen: string;
  finalState: 'PRESENT' | 'REMOVED';
  claimCount: number;
  captures: TrajectoryCapture[];
  changes: TrajectorySpan[];
  claims: { trajectoryId: string; claimHash: string; claimText: string }[];
  page: CorpusPage;
}

/**
 * `list_trajectories`' answer at one page (§6.1 :248).
 *
 * THE ORDER IS THE READ'S — by the date the claim LAST LEFT, latest first — and it is NOT `lastSeen`:
 * `corpusReads.ts`' `leftAt` takes the last absent span after the first, so five PRESENT rows of the real
 * page sit in the middle of the list under their departure date. The page re-sorts nothing, which is why
 * no sort key is derivable from this type.
 *
 * `undetected` NAMES a page in scope whose current state no stored pass describes, so an absence never
 * reads as "nothing moved". A page with no trajectories arrives here, with `entries: []`.
 */
export interface TrajectoryAnswer {
  entries: TrajectoryEntry[];
  undetected: CorpusPage[];
  nextCursor: string | null;
}

/**
 * ONE ENDPOINT OF A PAIR (A4 :1096) — an OBJECT carrying its own bytes, never a bare timestamp.
 */
export interface DiffSide {
  capture: string;
  textHash: string;
  textExtractionVersion: string;
  text: string;
}

/**
 * `get_diff_input`'s CURRENT version (A4 :1096) — ITS OWN TYPE, and not `CurrentContent`.
 *
 * The two are different bodies from different tools: `list_findings` sends `{ contentVersionHash, chunks }`
 * for every diff row (A4 :1084) and `get_diff_input` sends `diffVersion` beside them. Widening one type to
 * cover both would make `diffVersion` optional everywhere and assert nothing at either door.
 *
 * `diffVersion` is PROVENANCE — "the inputs" (evidence :237, :969). It is narrowed because the body carries
 * it; no clause of §26 or the UI plan renders it, and nothing does.
 */
export interface DiffCurrent {
  contentVersionHash: string;
  diffVersion: string;
  chunks: DiffChunk[];
}

/**
 * `get_diff_input`'s answer for one pair (A4 :1096).
 *
 * `current` IS NOT NULLABLE AND THERE IS NO `awaitingDerivation` FIELD. An undefined CURRENT is the
 * AWAITING_DERIVATION refusal — `{ error, code }` at 409 (ui §6 :267), an early return in `getDiffInput.ts`
 * :114-:121 — and so a page state, never a value in a 200 body. The boolean this type used to carry was
 * `list_findings`' diff row (A4 :1085), a neighbouring clause of a different tool.
 */
export interface DiffInput {
  page: PageRef;
  before: DiffSide;
  after: DiffSide;
  current: DiffCurrent;
  /**
   * THE DIFF ROW'S OWN THREE FIELDS — ruled 2026-09-20 (A4 :1096), so the diff page can draw what §26
   * :852–:856 asks of it without a second read of the page's whole timeline (§8 :344).
   *
   * THEY ARE THE STREAM'S TYPES, not new ones: the backend builds them with `diffRow`, the one builder
   * `list_findings` uses, so a second spelling on either side would let the corpus and the diff page show
   * two accounts of one record. The intervening captures BEHIND `narrowed` are served by no read and stay
   * owed — `narrowed` is the MARK, not the list.
   */
  opinion: ClassifierOpinion | null;
  narrowed: boolean;
  evidence: EvidenceLink | null;
}

/**
 * THE PAGE A RECORD'S READ NAMES — `{ url, public }`, and deliberately NOT `CorpusPage`.
 *
 * `get_capture`, `get_diff_input` and `resolve_record` all send this and no `trackedUrlId` (evidence A4 :1082,
 * :1096, :1106; confirmed on all three running routes). It is named once rather than spelled inline three
 * times, and it is a DIFFERENT type from `CorpusPage` rather than a subset of it: the stream's rows carry the
 * id because a list must link to each row, while these reads answer about a page the reader already named in
 * the URL — "a page that read it back out of the body would be deriving an identity it was already handed".
 */
export interface PageRef {
  url: string;
  public: boolean;
}

/**
 * `get_capture`'s answer (evidence A4 :1082) — ONE capture's row PLUS its bytes.
 *
 * THE ROW HERE CARRIES NO `kind` AND NO `page`, and that is the BODY's shape rather than an omission: the
 * read answers one capture of one page, so the page is stated once at the top and the row is the timeline's
 * row exactly. `trackedUrlId` is deliberately absent — the id is the one the READER asked with, in the URL,
 * and a page that read it back out of the body would be deriving an identity it was already handed (§4).
 */
export interface CaptureRead {
  page: PageRef;
  capture: Omit<CaptureEntry, 'kind' | 'page'>;
  text: string;
  /** WHICH extraction the bytes are — stated by the read, never assumed by the page. */
  textHash: string;
  /** True when no extraction was asked for, so the bytes are the capture's CURRENT text. */
  current: boolean;
}

/**
 * ONE CAPTURE BENEATH A RECORD, and what the chain state stored about its anchor (A4 :1106).
 *
 * `checkedAt` IS A STRING HERE AND A `Date` ON THE BACKEND (`evidencePredicates.ts` :546). What crosses the
 * wire is JSON, so the page reads the ISO text the route serialised and never a `Date` it did not receive.
 */
export interface RecordCaptureAttribution {
  capture: string;
  documentHash: string;
  anchoredHash: string | null;
  anchoredHashMatchesDocumentHash: boolean;
  attributed: boolean | null;
  verdict: string | null;
  verifierVersion: string | null;
  checkedAt: string | null;
}

/**
 * FLAGGED'S REPORT (A3 :1054) — never a bit.
 *
 * `armsEvaluated` and `reasons` are `string[]` AND ARE NOT NARROWED TO A UNION, which is the opposite call
 * from `notEvaluable` below, deliberately. Both are OPEN sets by construction: SHED joins the arms when the
 * `Document` table lands (`evidencePredicates.ts` :755-:758), and A4 :1106 writes `[string]` for each. A page
 * renders the report's own words; a frontend union would refuse a body the backend legitimately widened.
 */
export interface FlagReport {
  flagged: boolean;
  armsEvaluated: string[];
  reasons: string[];
}

/** A published version citing a record, with its FLAGGED report and its text (A4 :1106). */
export interface CitingPublishedVersion {
  thesisId: string;
  versionId: string;
  contentHash: string;
  pin: string | null;
  flagged: FlagReport;
  text: string;
}

/**
 * VERIFIED, OR THE REASON IT CANNOT BE ASKED of this record (A4 :1106).
 *
 * The TWO reasons ARE narrowed — they are `evidencePredicates.ts`' `VerifiedReport` closed union, reached through
 * `resolveRecord.ts` :134 (`notEvaluable: report.reason`), and §18 :574 shows each as a reason rather than a
 * failure. A third reason must reach the page as a loud parse failure and not as an unrendered string. The third it
 * once had, `DOCUMENT_CLASS_NOT_BUILT`, was retired at document step 34 (evidence A4 :1106 as CONFORMED 2026-09-26,
 * the researcher's Q12): no DOCUMENT row reaches this read.
 */
export const NOT_EVALUABLE_REASONS = ['NOT_PROMOTED', 'MALFORMED_RECORD_KEY'] as const;

export type NotEvaluableReason = (typeof NOT_EVALUABLE_REASONS)[number];

export type RecordVerified =
  | { verified: boolean; captures: RecordCaptureAttribution[] }
  | { notEvaluable: NotEvaluableReason };

/**
 * THE RECORD'S ENDPOINTS BY THEIR ARCHIVE NAMES (A4 :1106) — "14-digit archive names, never dates".
 *
 * This replaced `first`/`last`, which the route has never sent: the frontend had read the clause's word
 * "timestamps" as dates and invented two fields for them.
 */
export type RecordNames = { capture: string } | { before: string; after: string };

/** `resolve_record`'s answer (A4 :1106) — what a stranger holding a citation needs. */
export interface ResolvedRecord {
  fileHash: string;
  kind: EntryKind;
  /**
   * `CorpusPage` AND NOT `PageRef` — ruled 2026-09-20 (A4 :1106). This is the ONE record read whose page
   * carries its id, because its reader arrived by the record's NAME and holds no page id: the link onward
   * to the record's page (§26 :860) has no other source. The other two reads keep `PageRef`.
   */
  page: CorpusPage;
  record: RecordNames;
  recomputable: boolean;
  verified: RecordVerified;
  citedBy: CitingPublishedVersion[];
}

/** One capture's chain verdict, as `check_on_chain_status` reports it (A4 :1111–:1114). */
export interface CaptureChainStatus {
  capture: string;
  documentHash: string;
  isRegistered: boolean;
  /** The registry's own index for this hash — the VERIFY disclosure's fourth value (§26 :831). */
  registryIndex: number | null;
  submitter: string | null;
  attributed: boolean;
  anchoredHash: string | null;
  anchoredHashMatchesDocumentHash: boolean;
  /** The verdict the platform STORED at its last check, with the version that reached it — null if never checked. */
  storedVerdict: { verdict: string; verifierVersion: string; checkedAt: string; attributed: boolean | null } | null;
}

/**
 * `check_on_chain_status`' answer (A4 :1111–:1115), or its one refusal.
 *
 * `CHAIN_UNAVAILABLE` IS A VERDICT ABOUT THE CHECK AND NEVER ABOUT THE RECORD (A4 :1115; §26). It is modelled
 * as a member of the union rather than as an error so that a renderer cannot reach it through a `catch` and
 * report it as a failed record.
 *
 * **RE-DERIVED 2026-09-19 FROM THE WIRE, and the shape it replaces was never served by anything.** This type
 * and its two fixtures were hand-written as a FLAT, single-capture object carrying `verdict` and
 * `verdictVersion` and a boolean `available` — fields the route does not send and the backend does not build.
 * The route answers `{ page, captures: CaptureStatus[], registry }` at 200 and `{ error, code }` at 503;
 * measured on the running body, `GET /api/pages/<id>/captures/<ts>/chain` returns a `captures` array. A4
 * :1111–:1115 names the FIELDS and not the envelope, which is how the guess survived — the same shape as the
 * `editorial`/`draws` defect A4 :1086 records, where a fixture written from the same wrong reading as the code
 * left 273 cases green and the page 500'd on the first real body. **The ENVELOPE is owed an A4 amendment.**
 */
export type ChainAnswer =
  | {
      available: true;
      page: PageRef;
      captures: CaptureChainStatus[];
      /** OBSERVED, never configured — a wrong environment records itself (the 2026-08-29 rule). */
      registry: { chainId: number | null; registryAddress: string | null };
    }
  | { available: false; reason: 'CHAIN_UNAVAILABLE' };
