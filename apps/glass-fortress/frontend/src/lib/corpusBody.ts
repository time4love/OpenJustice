import {
  INVESTIGATIVE_CATEGORIES,
  type ClassifierOpinion,
  type CorpusAnswer,
  type CorpusEntry,
  type CaptureRead,
  type ChainAnswer,
  type CorpusPage,
  type DiffInput,
  type DiffSide,
  type FlagReport,
  NOT_EVALUABLE_REASONS,
  type NotEvaluableReason,
  type PageRef,
  type RecordCaptureAttribution,
  type RecordNames,
  type RecordVerified,
  type ResolvedRecord,
  type DiffChunk,
  type EvidenceLink,
  type InvestigativeCategory,
  type PagesFacetRow,
} from '@/types/corpus';

// ---------------------------------------------------------------------------
// THE CORPUS BODY AT THE BOUNDARY — docs/gf-ui-flows.md §8 :331–:333 ("bytes, not views"), §28 :792;
// UI plan §4 :880–:883 (fixture drift: the fixtures come from the appendix, so a route body that drifts from it
// passes the suite and breaks the page).
//
// A body is NARROWED here, at the read, or it is not rendered — `lib/thesisBody.ts`' discipline, applied to the
// corpus. The failure a drift produces is then LOUD and names the field, never a region that silently renders
// nothing, which a reader cannot tell from "there is nothing to show".
//
// THIS CHUNK PARSES THE FACET AND NOTHING ELSE. The pages list reads `pages` and never `entries`, so narrowing
// `entries` here would be a parser for a body no caller in this chunk holds — and a parser nothing exercises is
// a parser nothing proves. The stream's rows are narrowed when the stream lands.
// ---------------------------------------------------------------------------

class CorpusBodyError extends Error {}

const fail = (at: string, want: string, got: unknown): never => {
  throw new CorpusBodyError(`corpus body: ${at} expected ${want}, got ${JSON.stringify(got) ?? 'undefined'}`);
};

const object = (value: unknown, at: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : fail(at, 'an object', value);

const maybeText = (value: unknown, at: string): string | null => (value === null || value === undefined ? null : text(value, at));

const maybeFlag = (value: unknown, at: string): boolean | null => (value === null || value === undefined ? null : flag(value, at));

const text = (value: unknown, at: string): string => (typeof value === 'string' ? value : fail(at, 'a string', value));
const flag = (value: unknown, at: string): boolean => (typeof value === 'boolean' ? value : fail(at, 'a boolean', value));
const count = (value: unknown, at: string): number => (typeof value === 'number' && Number.isFinite(value) ? value : fail(at, 'a number', value));
const list = (value: unknown, at: string): unknown[] => (Array.isArray(value) ? value : fail(at, 'an array', value));

/**
 * One row of the `pages` facet (§28 :792).
 *
 * `public` IS NARROWED AS A REQUIRED BOOLEAN AND NOT DEFAULTED. UI-2 added it so the gated door can mark a row
 * of a page not yet opened without a second read, and it is "always true at `public`". A missing `public` must
 * therefore FAIL rather than default to `false` (a row silently dropped from a public list) or to `true` (a row
 * shown that the scope may not have meant) — either default would decide a DISCLOSURE question by accident.
 */
function pagesFacetRow(value: unknown, at: string): PagesFacetRow {
  const row = object(value, at);
  return {
    trackedUrlId: text(row.trackedUrlId, `${at}.trackedUrlId`),
    url: text(row.url, `${at}.url`),
    public: flag(row.public, `${at}.public`),
    first: text(row.first, `${at}.first`),
    last: text(row.last, `${at}.last`),
    entries: count(row.entries, `${at}.entries`),
  };
}

/** The `pages` facet of `list_corpus`' answer — the pages list's ONLY legal source (§24 :680–:681, §28). */
export function parseCorpusPages(body: unknown): PagesFacetRow[] {
  const answer = object(body, 'the answer');
  return list(answer.pages, 'pages').map((row, index) => pagesFacetRow(row, `pages[${String(index)}]`));
}

/**
 * THE `entries` NARROWING, landing with the stream that first calls it — chunk 2 parsed the facet alone, on
 * this module's own rule: a parser nothing exercises is a parser nothing proves.
 *
 * EVERY FIELD NAMES ITSELF, so a body that drifts from A4 :1080–:1090 fails HERE, at the read, saying which
 * field moved — instead of drawing a row with a blank interval that a reader cannot tell from a record which
 * has none.
 */
const chunk = (value: unknown, at: string): DiffChunk => {
  const row = object(value, at);
  const side = text(row.side, `${at}.side`);
  if (side !== 'REMOVED' && side !== 'ADDED') return fail(`${at}.side`, "'REMOVED' or 'ADDED'", side);
  return { side, text: text(row.text, `${at}.text`) };
};

const corpusPage = (value: unknown, at: string): CorpusPage => {
  const row = object(value, at);
  return {
    trackedUrlId: text(row.trackedUrlId, `${at}.trackedUrlId`),
    url: text(row.url, `${at}.url`),
    public: flag(row.public, `${at}.public`),
  };
};

/**
 * THE PAGE A RECORD'S READ NAMES (A4 :1082, :1096, :1106) — `{ url, public }`, and NOT `corpusPage`.
 *
 * `corpusPage` requires `trackedUrlId`, which these three routes have never sent. Narrowing them through it
 * threw `page.trackedUrlId expected a string` on every real body while every fixture-fed case passed, because
 * the fixtures were written from the same reading as the parser. `get_capture`'s parser already spelled this
 * shape inline and was the only one of the three that was right.
 */
const pageRef = (value: unknown, at: string): PageRef => {
  const row = object(value, at);
  return { url: text(row.url, `${at}.url`), public: flag(row.public, `${at}.public`) };
};

/** One endpoint of a pair (A4 :1096) — an OBJECT carrying its own bytes, never a bare timestamp. */
const diffSide = (value: unknown, at: string): DiffSide => {
  const row = object(value, at);
  return {
    capture: text(row.capture, `${at}.capture`),
    textHash: text(row.textHash, `${at}.textHash`),
    textExtractionVersion: text(row.textExtractionVersion, `${at}.textExtractionVersion`),
    text: text(row.text, `${at}.text`),
  };
};

/**
 * One capture beneath a record with its stored anchor state (A4 :1106).
 *
 * FOUR FIELDS ARE NULLABLE AND NONE OF THEM IS READ AS "no": a capture nothing has checked is not a capture
 * that failed its check, and `attributed: null` is "not asked" rather than "not attributed".
 */
const captureAttribution = (value: unknown, at: string): RecordCaptureAttribution => {
  const row = object(value, at);
  return {
    capture: text(row.capture, `${at}.capture`),
    documentHash: text(row.documentHash, `${at}.documentHash`),
    anchoredHash: maybeText(row.anchoredHash, `${at}.anchoredHash`),
    anchoredHashMatchesDocumentHash: flag(row.anchoredHashMatchesDocumentHash, `${at}.anchoredHashMatchesDocumentHash`),
    attributed: maybeFlag(row.attributed, `${at}.attributed`),
    verdict: maybeText(row.verdict, `${at}.verdict`),
    verifierVersion: maybeText(row.verifierVersion, `${at}.verifierVersion`),
    // AN ISO STRING, NOT A `Date`: what crossed the wire is JSON (`evidencePredicates.ts` :546 types the
    // backend's own field as `Date`, and the route serialised it before this parser ever saw it).
    checkedAt: maybeText(row.checkedAt, `${at}.checkedAt`),
  };
};

const isNotEvaluable = (reason: string): reason is NotEvaluableReason =>
  NOT_EVALUABLE_REASONS.some((known) => known === reason);

/**
 * VERIFIED, or the reason it cannot be asked (A4 :1106).
 *
 * THE REASON IS NARROWED and the flag report's arms are not, deliberately. The reasons are a closed union the
 * backend owns (`evidencePredicates.ts` :566) and each has a sentence on the page (§18 :574), so a fourth one
 * must fail loudly rather than render as nothing; the ARMS are open by construction and a union here would
 * refuse a body the backend legitimately widened.
 */
const recordVerified = (value: unknown, at: string): RecordVerified => {
  const row = object(value, at);
  if ('notEvaluable' in row) {
    const reason = text(row.notEvaluable, `${at}.notEvaluable`);
    if (!isNotEvaluable(reason)) return fail(`${at}.notEvaluable`, NOT_EVALUABLE_REASONS.join(' or '), reason);
    return { notEvaluable: reason };
  }
  return {
    verified: flag(row.verified, `${at}.verified`),
    captures: list(row.captures, `${at}.captures`).map((one, index) => captureAttribution(one, `${at}.captures[${String(index)}]`)),
  };
};

/** FLAGGED's REPORT (A3 :1054) — never a bit; a check that examined nothing names the arms it did ask. */
const flagReport = (value: unknown, at: string): FlagReport => {
  const row = object(value, at);
  return {
    flagged: flag(row.flagged, `${at}.flagged`),
    armsEvaluated: list(row.armsEvaluated, `${at}.armsEvaluated`).map((one, index) => text(one, `${at}.armsEvaluated[${String(index)}]`)),
    reasons: list(row.reasons, `${at}.reasons`).map((one, index) => text(one, `${at}.reasons[${String(index)}]`)),
  };
};

/** The record's endpoints by their archive names (A4 :1106) — a capture, or the pair, never a date. */
const recordNames = (value: unknown, at: string): RecordNames => {
  const row = object(value, at);
  if ('capture' in row) return { capture: text(row.capture, `${at}.capture`) };
  return { before: text(row.before, `${at}.before`), after: text(row.after, `${at}.after`) };
};

const evidenceLink = (value: unknown, at: string): EvidenceLink | null => {
  if (value === null || value === undefined) return null;
  const row = object(value, at);
  return {
    fileHash: text(row.fileHash, `${at}.fileHash`),
    status: text(row.status, `${at}.status`),
    citedBy: list(row.citedBy, `${at}.citedBy`).map((cited, index) => {
      const entry = object(cited, `${at}.citedBy[${String(index)}]`);
      return {
        thesisId: text(entry.thesisId, `${at}.citedBy[${String(index)}].thesisId`),
        published: flag(entry.published, `${at}.citedBy[${String(index)}].published`),
      };
    }),
  };
};

/**
 * The classifier's opinion, or null.
 *
 * `legallySignificant` IS NOT DEFAULTED, and that is a disclosure decision rather than a style one: the
 * significance gate reads exactly that field, so a default either way would decide by accident whether a
 * record is shown to a reader — the same class of silent choice `public` was given a required boolean for.
 */
const classifierOpinion = (value: unknown, at: string): ClassifierOpinion | null => {
  if (value === null || value === undefined) return null;
  const row = object(value, at);
  return {
    significance: text(row.significance, `${at}.significance`),
    categories: list(row.categories, `${at}.categories`).map((category, index) => {
      const name = text(category, `${at}.categories[${String(index)}]`);
      return INVESTIGATIVE_CATEGORIES.includes(name as InvestigativeCategory)
        ? (name as InvestigativeCategory)
        : fail(`${at}.categories[${String(index)}]`, 'one of the seven investigative categories', name);
    }),
    legallySignificant: flag(row.legallySignificant, `${at}.legallySignificant`),
    editorial: flag(row.editorial, `${at}.editorial`),
    classifierVersion: text(row.classifierVersion, `${at}.classifierVersion`),
    draws: count(row.draws, `${at}.draws`),
  };
};

function corpusEntry(value: unknown, at: string): CorpusEntry {
  const row = object(value, at);
  const kind = text(row.kind, `${at}.kind`);
  const page = corpusPage(row.page, `${at}.page`);
  const evidence = evidenceLink(row.evidence, `${at}.evidence`);
  if (kind === 'CAPTURE') {
    const anchor = object(row.anchor, `${at}.anchor`);
    return {
      kind: 'CAPTURE',
      capture: text(row.capture, `${at}.capture`),
      snapshotDate: text(row.snapshotDate, `${at}.snapshotDate`),
      fileHash: text(row.fileHash, `${at}.fileHash`),
      textHash: text(row.textHash, `${at}.textHash`),
      textExtractionVersion: text(row.textExtractionVersion, `${at}.textExtractionVersion`),
      anchor: {
        documentHash: text(anchor.documentHash, `${at}.anchor.documentHash`),
        attributed: flag(anchor.attributed, `${at}.anchor.attributed`),
      },
      evidence,
      page,
    };
  }
  if (kind !== 'DIFF') return fail(`${at}.kind`, "'CAPTURE' or 'DIFF'", kind);
  const current = row.current;
  return {
    kind: 'DIFF',
    before: text(row.before, `${at}.before`),
    after: text(row.after, `${at}.after`),
    fileHash: text(row.fileHash, `${at}.fileHash`),
    current:
      current === null || current === undefined
        ? null
        : (() => {
            const held = object(current, `${at}.current`);
            return {
              contentVersionHash: text(held.contentVersionHash, `${at}.current.contentVersionHash`),
              chunks: list(held.chunks, `${at}.current.chunks`).map((one, index) => chunk(one, `${at}.current.chunks[${String(index)}]`)),
            };
          })(),
    awaitingDerivation: flag(row.awaitingDerivation, `${at}.awaitingDerivation`),
    opinion: classifierOpinion(row.opinion, `${at}.opinion`),
    narrowed: flag(row.narrowed, `${at}.narrowed`),
    evidence,
    page,
  };
}

/**
 * `GET /api/pages/:trackedUrlId/captures/:capture`'s answer — THE BYTES ONLY (evidence A4 :1082).
 *
 * IT DELIBERATELY DOES NOT RE-PARSE THE ROW. The answer carries the capture's row as well, and the sheet
 * asking for the text ALREADY HOLDS that row: it came from the stream the sheet was opened over. Narrowing
 * it a second time here would be a parser with no caller — "a parser nothing exercises is a parser nothing
 * proves", this module's own rule — and, worse, a SECOND composition of a row the design says is one.
 *
 * `current` IS NARROWED AND NOT DEFAULTED, for the same reason `public` is above: it is the answer's
 * statement about WHICH extraction the bytes are, and a missing one defaulted either way would decide,
 * silently, whether a reader is looking at the current text or a pinned one.
 */
export function parseCaptureText(body: unknown): { text: string; textHash: string; current: boolean } {
  const answer = object(body, 'the answer');
  return {
    text: text(answer.text, 'text'),
    textHash: text(answer.textHash, 'textHash'),
    current: flag(answer.current, 'current'),
  };
}

/**
 * THE CAPTURE PAGE'S WHOLE ANSWER (evidence A4 :1082) — the row AND the bytes, unlike `parseCaptureText`.
 *
 * TWO PARSERS OVER ONE BODY, AND THE REASON IS THE CALLER AND NOT THE SHAPE. The SHEET already holds the
 * row — it came from the stream it was opened over — and needs only the text. The PAGE holds nothing: a
 * reader arriving at `/pages/<id>/captures/<ts>` has no stream behind them, so the row is what this read is
 * for. Each parser narrows exactly what its caller renders, and neither is a superset of the other by accident.
 */
export function parseCaptureRead(body: unknown): CaptureRead {
  const answer = object(body, 'the answer');
  const row = object(answer.capture, 'capture');
  const anchor = object(row.anchor, 'capture.anchor');
  return {
    page: pageRef(answer.page, 'page'),
    capture: {
      capture: text(row.capture, 'capture.capture'),
      snapshotDate: text(row.snapshotDate, 'capture.snapshotDate'),
      fileHash: text(row.fileHash, 'capture.fileHash'),
      textHash: text(row.textHash, 'capture.textHash'),
      textExtractionVersion: text(row.textExtractionVersion, 'capture.textExtractionVersion'),
      anchor: { documentHash: text(anchor.documentHash, 'capture.anchor.documentHash'), attributed: flag(anchor.attributed, 'capture.anchor.attributed') },
      evidence: evidenceLink(row.evidence, 'capture.evidence'),
    },
    text: text(answer.text, 'text'),
    textHash: text(answer.textHash, 'textHash'),
    current: flag(answer.current, 'current'),
  };
}

/**
 * `get_diff_input`'s answer for one pair (A4 :1096).
 *
 * `current` IS REQUIRED. An undefined CURRENT is the AWAITING_DERIVATION refusal — `{ error, code }` at 409
 * (ui §6 :267), returned by `getDiffInput.ts` :114-:121 before a body is built — so it is a PAGE STATE and
 * never a value here. Reading a null as that state would draw "not derived yet" over a body that is broken.
 */
export function parseDiffInput(body: unknown): DiffInput {
  const answer = object(body, 'the answer');
  const current = object(answer.current, 'current');
  return {
    page: pageRef(answer.page, 'page'),
    before: diffSide(answer.before, 'before'),
    after: diffSide(answer.after, 'after'),
    current: {
      contentVersionHash: text(current.contentVersionHash, 'current.contentVersionHash'),
      // PROVENANCE, narrowed because the body carries it (evidence :237, :969). Nothing renders it.
      diffVersion: text(current.diffVersion, 'current.diffVersion'),
      chunks: list(current.chunks, 'current.chunks').map((one, index) => chunk(one, `current.chunks[${String(index)}]`)),
    },
    // THE STREAM'S OWN NARROWINGS, CALLED — never a second spelling. One body, one set of rules about what
    // an opinion and a linkage may be, whichever read carried them.
    opinion: classifierOpinion(answer.opinion, 'opinion'),
    narrowed: flag(answer.narrowed, 'narrowed'),
    evidence: evidenceLink(answer.evidence, 'evidence'),
  };
}

/**
 * `resolve_record`'s answer (A4 :1106) — what a stranger holding a citation needs.
 *
 * `recomputable` IS A REQUIRED BOOLEAN AND NEVER DEFAULTED: it is a claim the platform makes about a record's
 * integrity, and a missing one read as `false` would understate a check that ran while `true` would assert one
 * that did not. `verified` is not a boolean at all — it is the report, or the reason it cannot be asked.
 */
export function parseResolvedRecord(body: unknown): ResolvedRecord {
  const answer = object(body, 'the answer');
  const kind = text(answer.kind, 'kind');
  if (kind !== 'CAPTURE' && kind !== 'DIFF') return fail('kind', "'CAPTURE' or 'DIFF'", kind);
  return {
    fileHash: text(answer.fileHash, 'fileHash'),
    kind,
    // `corpusPage` AND NOT `pageRef`: this read alone carries the page's id (A4 :1106, 2026-09-20).
    page: corpusPage(answer.page, 'page'),
    record: recordNames(answer.record, 'record'),
    recomputable: flag(answer.recomputable, 'recomputable'),
    verified: recordVerified(answer.verified, 'verified'),
    citedBy: list(answer.citedBy, 'citedBy').map((one, index) => {
      const at = `citedBy[${String(index)}]`;
      const row = object(one, at);
      return {
        thesisId: text(row.thesisId, `${at}.thesisId`),
        versionId: text(row.versionId, `${at}.versionId`),
        contentHash: text(row.contentHash, `${at}.contentHash`),
        // THE PIN may be null — a citation with no pinned content version.
        pin: maybeText(row.pin, `${at}.pin`),
        flagged: flagReport(row.flagged, `${at}.flagged`),
        // THE CITING VERSION'S WHOLE TEXT (thesis A2 :1273), `#ev_…` tokens included.
        text: text(row.text, `${at}.text`),
      };
    }),
  };
}

/**
 * `check_on_chain_status`' answer (A4 :1111–:1115), or its ONE refusal.
 *
 * `CHAIN_UNAVAILABLE` IS NARROWED INTO THE UNION, never raised: it is a verdict about THE CHECK and never
 * about the record, and a renderer reaching it through a `catch` would report a failed record instead.
 */
export function parseChainAnswer(body: unknown): ChainAnswer {
  const answer = object(body, 'the answer');
  // THE WIRE'S OWN SPELLING, and nothing invented. A refusal is `{ error, code }` at 503 — `toolRoute.ts`'
  // one refusal shape — so `code` is what is read. `available` is the FRONTEND's discriminant, produced
  // here; a parser that read it back off the body would be reading a field no route sends.
  if (answer.code === 'CHAIN_UNAVAILABLE') return { available: false, reason: 'CHAIN_UNAVAILABLE' };
  const registry = object(answer.registry, 'registry');
  return {
    available: true,
    page: pageRef(answer.page, 'page'),
    captures: list(answer.captures, 'captures').map((one, index) => {
      const at = `captures[${String(index)}]`;
      const row = object(one, at);
      const stored = row.storedVerdict;
      return {
        capture: text(row.capture, `${at}.capture`),
        documentHash: text(row.documentHash, `${at}.documentHash`),
        isRegistered: flag(row.isRegistered, `${at}.isRegistered`),
        registryIndex: typeof row.registryIndex === 'number' ? row.registryIndex : null,
        submitter: maybeText(row.submitter, `${at}.submitter`),
        attributed: flag(row.attributed, `${at}.attributed`),
        anchoredHash: maybeText(row.anchoredHash, `${at}.anchoredHash`),
        anchoredHashMatchesDocumentHash: flag(row.anchoredHashMatchesDocumentHash, `${at}.anchoredHashMatchesDocumentHash`),
        // NULL IS A FACT HERE, not a gap: "no verdict was ever stored under the current rule" is neither
        // true nor false about the chain, and it must never be read as "no".
        storedVerdict:
          stored === null || stored === undefined
            ? null
            : (() => {
                const held = object(stored, `${at}.storedVerdict`);
                return {
                  verdict: text(held.verdict, `${at}.storedVerdict.verdict`),
                  verifierVersion: text(held.verifierVersion, `${at}.storedVerdict.verifierVersion`),
                  checkedAt: text(held.checkedAt, `${at}.storedVerdict.checkedAt`),
                  attributed: typeof held.attributed === 'boolean' ? held.attributed : null,
                };
              })(),
      };
    }),
    registry: {
      chainId: typeof registry.chainId === 'number' ? registry.chainId : null,
      registryAddress: maybeText(registry.registryAddress, 'registry.registryAddress'),
    },
  };
}

/** `GET /api/corpus`'s whole answer (A4 :1080–:1093): the entries, the `pages` facet (§28) and the cursor. */
export function parseCorpusStream(body: unknown): CorpusAnswer {
  const answer = object(body, 'the answer');
  return {
    entries: list(answer.entries, 'entries').map((entry, index) => corpusEntry(entry, `entries[${String(index)}]`)),
    pages: parseCorpusPages(body),
    nextCursor: maybeText(answer.nextCursor, 'nextCursor'),
  };
}
