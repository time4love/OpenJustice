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

/** One row of the `pages` FACET (§28 :751–:753) — the pages list's only legal source at `public`. */
export interface PagesFacetRow extends CorpusPage {
  /** The first and last snapshot dates in scope — an INTERVAL, which is how a page is shown (§4 :169). */
  first: string;
  last: string;
  /** How many records the scope holds for this page. */
  entries: number;
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
  side: 'REMOVED' | 'ADDED';
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

/** `get_diff_input`'s answer (A4 :1095–:1099): the pair's two texts and the CURRENT version's chunks. */
export interface DiffInput {
  before: string;
  after: string;
  beforeText: string;
  afterText: string;
  current: CurrentContent | null;
  awaitingDerivation: boolean;
  page: CorpusPage;
}

/** One capture beneath a record, with its own attribution (A4 :1105–:1108, "per-capture attribution"). */
export interface RecordCapture {
  capture: string;
  snapshotDate: string;
  attributed: boolean;
}

/** A published version citing a record, with its FLAGGED mark and its text (A4 :1108–:1109). */
export interface CitingPublishedVersion {
  thesisId: string;
  versionId: string;
  publishedAt: string;
  flagged: boolean;
  text: string;
}

/** `resolve_record`'s answer (A4 :1105–:1109) — what a stranger holding a citation needs. */
export interface ResolvedRecord {
  fileHash: string;
  kind: EntryKind;
  page: CorpusPage;
  first: string;
  last: string;
  recomputable: boolean;
  verified: boolean;
  captures: RecordCapture[];
  citedBy: CitingPublishedVersion[];
}

/**
 * `check_on_chain_status`' answer (A4 :1111–:1115), or its one refusal.
 *
 * `CHAIN_UNAVAILABLE` IS A VERDICT ABOUT THE CHECK AND NEVER ABOUT THE RECORD (A4 :1115; §26 :715–:716).
 * It is modelled as a member of the union rather than as an error so that a renderer cannot reach it through
 * a `catch` and report it as a failed record.
 */
export type ChainAnswer =
  | {
      available: true;
      isRegistered: boolean;
      attributed: boolean;
      anchoredHash: string;
      documentHash: string;
      verdict: string;
      verdictVersion: string;
    }
  | { available: false; reason: 'CHAIN_UNAVAILABLE' };
