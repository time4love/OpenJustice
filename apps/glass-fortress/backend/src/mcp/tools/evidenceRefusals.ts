import { getResearcherId } from '../../context/researcherContext';
import { publicPage } from '../../services/evidencePredicates';
import {
  loadPage,
  loadPageById,
  pagesInScope,
  type CaptureLookup,
  type CorpusScope,
  type Page,
  type PageRef,
  type ScopedPage,
} from '../../services/corpusReads';

// ---------------------------------------------------------------------------
// THE EVIDENCE READS' REFUSALS — docs/gf-evidence-flows.md A4's conventions.
//
// "Every refusal is a JSON `{ error, code }`, never a throw." One module holds
// the shape and the CLOSED SET of codes these four reads may return, so a
// refusal with a code the contract does not name fails to compile rather than
// reaching a caller as a new word.
//
// WHY THIS IS NOT `src/walk/refusals.ts`. That module holds the same property
// for the walk's tools and lives under `src/walk`, which this step must leave
// byte-identical (`git diff staging -- src/walk` empty). Two modules, one per
// layer, each closed over its own contract's codes — rather than one module
// edited across a boundary the refactor plan draws. If the two ever need to be
// one, that is a change to the walk's files and belongs to a step that may make
// it.
//
// THE ONE GATE. A4: "PUBLIC reads take no identity and answer identically for
// everyone. Access to a page's timeline is gated by PUBLIC_PAGE for a caller
// without identity — THAT IS ACCESS, NOT A SECOND BEHAVIOUR: the output never
// depends on who asks."
// ---------------------------------------------------------------------------

/**
 * Every code A4 names for `list_findings`, `get_diff_input`, `resolve_record`
 * and `check_on_chain_status`, transcribed whole. Nothing else may be returned.
 */
export type EvidenceReadCode =
  | 'NOT_SURVEYED'
  | 'NOT_PUBLIC'
  | 'NOT_A_CAPTURE'
  | 'NO_SUCH_DIFF'
  | 'AWAITING_DERIVATION'
  | 'NOT_A_RECORD'
  | 'CHAIN_UNAVAILABLE';

/**
 * Every code evidence A4 and thesis T3 name for the debate's four WRITES —
 * `open_debate`, `respond_in_debate`, `promote_from_debate`, `get_debate` —
 * transcribed whole, in a SECOND closed set beside the reads' rather than in a
 * third module. The reads' set stays exactly what A4 gives those four tools; a
 * refusal with a code its own contract does not name fails to compile either way.
 *
 * `NOT_AUTHOR` is here because THE THESIS FLOWS AMEND A4, which was silent:
 * "versions, ARGUMENTS, decisions … are theirs" (§9), and A7 asks for "a test
 * that calls each write tool as a second researcher".
 */
export type EvidenceWriteCode =
  | 'NO_RESEARCHER'
  | 'REASON_REQUIRED'
  | 'NO_THESIS'
  | 'NOT_AUTHOR'
  | 'NOT_SURVEYED'
  | 'NOT_A_CAPTURE'
  | 'NOT_ACQUIRED'
  | 'NO_SUCH_DIFF'
  | 'NOT_CITED'
  | 'AWAITING_DERIVATION'
  | 'CONTRADICTED'
  | 'NOTHING_TO_PROMOTE'
  | 'NARROWED'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'NOT_READY'
  | 'STALE_PIN'
  // THE REVIEW'S OWN FOUR — evidence step 14, A4's `review_evidence`. Three name
  // states no debate tool can be in (a name the corpus does not hold at all; a
  // record nobody promoted or one already withdrawn; a record whose CURRENT is
  // what a human already affirmed), and the fourth is the compare-and-set on the
  // record's review log, which `EvidenceDecision.@@unique([fileHash, sequence])`
  // enforces from the database side.
  | 'NOT_A_RECORD'
  | 'NOT_PROMOTED'
  | 'NOTHING_TO_REVIEW'
  | 'STALE_SEQUENCE'
  // THE DOCUMENT'S TWO — document step 33 (plan :247; document A4 :1398, :1400, :1455). The debate is HANDED a
  // commitment, so a commitment naming no document is NOT_A_DOCUMENT (:1398 — the word of the tools handed one, R81
  // Q1), and a document whose content was taken back is SHED, naming its cause and date (:1400).
  | 'NOT_A_DOCUMENT'
  | 'SHED';

/**
 * The seven checks a RECORD must pass to be argued or promoted (§4.1's rows
 * 5–13), as their own type: `recordChecks` produces exactly these and both
 * `open_debate` and `promotionBlockers` consume them — and, since document step
 * 33, the DOCUMENT arm's two of its own (document §6 :701–:704).
 */
export type RecordCode = Extract<
  EvidenceWriteCode,
  | 'NOT_A_DOCUMENT'
  | 'SHED'
  | 'NOT_SURVEYED'
  | 'NOT_A_CAPTURE'
  | 'NOT_ACQUIRED'
  | 'NO_SUCH_DIFF'
  | 'NOT_CITED'
  | 'AWAITING_DERIVATION'
  | 'CONTRADICTED'
  | 'NOTHING_TO_PROMOTE'
  | 'NARROWED'
>;

/**
 * What `blockedBy` may say — NOT `EvidenceWriteCode`.
 *
 * The last two are what `NOT_READY` is ABOUT and are never refusals themselves,
 * so typing the field over the refusal union would make two words refusable that
 * no tool ever returns.
 */
export type BlockerCode = RecordCode | 'STALE_PIN' | 'NO_SUBSTANCE' | 'OBJECTION_UNANSWERED';

/**
 * THE CORPUS READS' CODES — docs/gf-ui-flows.md §6.1 :242–:252 and docs/gf-ui-refactor-plan.md UI-2 :167–:173, a
 * THIRD closed set beside the per-page reads' and the writes', for `list_corpus`, `list_trajectories` and
 * `search_corpus` (UI-2). `NOT_PUBLIC` here keys on the SCOPE, never on identity: a named page not PUBLIC_PAGE at
 * `scope: 'public'` is refused whoever asks (plan :167–:168), where the per-page reads above refuse it to a caller
 * without identity (A4 :1092). `PHRASE_REQUIRED` is REASON_REQUIRED's shape for a blank phrase.
 */
export type CorpusReadCode = 'NO_RESEARCHER' | 'INVALID_RANGE' | 'PHRASE_REQUIRED' | 'NOT_SURVEYED' | 'NOT_PUBLIC';

/** Every code any layer may return — the three closed sets, together. */
export type EvidenceCode = EvidenceReadCode | EvidenceWriteCode | CorpusReadCode;

export interface Refusal<C extends EvidenceCode = EvidenceReadCode> {
  error: string;
  code: C;
}

export function refusal<C extends EvidenceCode>(code: C, error: string): Refusal<C> {
  return { error, code };
}

/**
 * The refusals these tools share, worded once.
 *
 * Typed to the LITERAL code rather than to a union, so one value satisfies a read
 * tool and a write tool without either closed set widening to admit the other's
 * words — `NOT_SURVEYED` is in both contracts and `NOT_PUBLIC` is in neither's
 * write half.
 */
export const shared = {
  notSurveyed: (url: string): Refusal<'NOT_SURVEYED'> =>
    refusal(
      'NOT_SURVEYED',
      `${url} is not in the corpus. Survey it first: survey_wayback_captures url=${url}`,
    ),
  notPublic: (url: string): Refusal<'NOT_PUBLIC'> =>
    refusal(
      'NOT_PUBLIC',
      `${url} is a researcher's working corpus: no published thesis cites any record of it, so ` +
        'its timeline is not public. A page becomes public in full — every capture and every diff — ' +
        'the moment a published thesis cites any record of it.',
    ),
  /** A page a ROUTE names by its id and no TrackedUrl holds (UI-3) — worded by the id, since that is what was named. */
  notSurveyedId: (trackedUrlId: string): Refusal<'NOT_SURVEYED'> =>
    refusal('NOT_SURVEYED', `${trackedUrlId} names no surveyed page. list_pages names every page the corpus holds.`),
};

/** A page a TOOL names — by its exact url (A1). */
export function pageByUrl(url: string): PageRef {
  return { load: () => loadPage(url), missing: () => shared.notSurveyed(url) };
}

/** A page a ROUTE names — by its `trackedUrlId` (docs/gf-ui-flows.md §6 :221). */
export function pageById(trackedUrlId: string): PageRef {
  return { load: () => loadPageById(trackedUrlId), missing: () => shared.notSurveyedId(trackedUrlId) };
}

/**
 * A named timestamp that is not a capture of this page — the three negatives,
 * worded ONCE and shared by both layers.
 *
 * MOVED HERE VERBATIM from `get_diff_input` at evidence step 13, because the
 * debate's writes ask the same question of the same work-list row: one state
 * must not acquire two wordings by being asked from two files. Which CODE the
 * three states map to still belongs to the caller — the read calls all three
 * NOT_A_CAPTURE, the write separates NOT_ACQUIRED (`corpusReads.CaptureLookup`).
 */
export function notACapture(
  page: Page,
  role: string,
  value: string,
  lookup: Exclude<CaptureLookup, { state: 'ACQUIRED' }>,
): Refusal<'NOT_A_CAPTURE'> {
  if (lookup.state === 'MALFORMED') {
    return refusal(
      'NOT_A_CAPTURE',
      `${role}=${value} is not a capture. A capture is named by its 14-digit wayback timestamp ` +
        '(YYYYMMDDHHMMSS), never by a date: three captures on one day are three captures. ' +
        `list_findings url=${page.url} lists every one this page holds.`,
    );
  }
  if (lookup.state === 'UNKNOWN') {
    return refusal(
      'NOT_A_CAPTURE',
      `${role}=${value} is not on this page's work-list at all: the archive never reported a ` +
        'capture at that timestamp. Re-survey the page if you expect the archive to have added it.',
    );
  }
  return refusal(
    'NOT_A_CAPTURE',
    `${role}=${value} is on this page's work-list with outcome ${lookup.outcome}, so the corpus holds ` +
      'no text for it. Only an ACQUIRED capture has a text version to diff.',
  );
}

/**
 * The PUBLIC_PAGE gate — asked ONCE per call, answering both questions it
 * decides: may this caller read the page, and is the page public.
 *
 * A caller WITH an identity reads every page; a caller without one reads a page
 * a published thesis has opened. What comes back after the gate is the same
 * bytes either way — the gate decides ACCESS and never CONTENT, which is why
 * `citedBy` lists published citations for a researcher too, and why a
 * researcher reading a private page is told `public: false` rather than shown
 * something an outsider would not see.
 */
export type PageAccess = { refused: Refusal<'NOT_PUBLIC'> } | { refused: null; public: boolean };

export async function openPage(page: Page): Promise<PageAccess> {
  const isPublic = await publicPage(page.id);
  if (!isPublic && getResearcherId() === null) return { refused: shared.notPublic(page.url) };
  return { refused: null, public: isPublic };
}

// ---------------------------------------------------------------------------
// THE CORPUS READS' THREE CHECKS, in the order the tools make them (UI-2): the
// scope's identity before any query, the range from the input alone, then the
// scope's pages and the one named. One spelling, three callers.
// ---------------------------------------------------------------------------

/**
 * `scope: 'all'` without a researcher is refused — BEFORE ANY QUERY (plan UI-2 :161; ui-flows §6.1 :232). `public`
 * takes no identity at all: this is the ONE place a corpus read reads the caller, and only to refuse.
 */
export function openScope(scope: CorpusScope): Refusal<'NO_RESEARCHER'> | null {
  if (scope === 'all' && getResearcherId() === null) {
    return refusal(
      'NO_RESEARCHER',
      "scope 'all' answers over every surveyed page — a researcher's working corpus — and needs a signed-in researcher. " +
        "scope 'public' answers over the pages a published thesis has opened, to anyone.",
    );
  }
  return null;
}

/** `since` after `until` is no range at all — decided from the input, before any query (ui-flows §6.1 :242). */
export function validRange(since: string | undefined, until: string | undefined): Refusal<'INVALID_RANGE'> | null {
  if (since !== undefined && until !== undefined && since > until) {
    return refusal('INVALID_RANGE', `since=${since} is after until=${until}: no day lies in that range.`);
  }
  return null;
}

/**
 * The pages of the scope, and the one the call names if it names one: a `page` no TrackedUrl holds is NOT_SURVEYED;
 * a surveyed page outside a `public` scope is NOT_PUBLIC — keyed on the SCOPE, so a researcher's bearer with
 * `scope: 'public'` is refused it too (plan UI-2 :167–:168; evidence A4 :1074 as amended: the output never depends
 * on who asks). At `all` every surveyed page is in scope, so a named page there is never refused NOT_PUBLIC.
 */
export async function scopedPages(
  scope: CorpusScope,
  ref: PageRef | undefined,
): Promise<Refusal<'NOT_SURVEYED' | 'NOT_PUBLIC'> | { scoped: ScopedPage[]; page: ScopedPage | null }> {
  const named = ref === undefined ? null : await ref.load();
  if (ref !== undefined && named === null) return ref.missing();
  const scoped = await pagesInScope(scope);
  if (named === null) return { scoped, page: null };
  const page = scoped.find((p) => p.id === named.id);
  if (page === undefined) return shared.notPublic(named.url);
  return { scoped, page };
}

/** A tool's answer as the MCP text: the value, or the refusal, as JSON. */
export async function answer<T>(body: () => Promise<T>): Promise<string> {
  return JSON.stringify(await body());
}
