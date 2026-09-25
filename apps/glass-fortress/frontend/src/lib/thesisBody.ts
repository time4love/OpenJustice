import type { ChunkSide } from '@/types/record';
import type {
  Citation,
  CitationRef,
  DocumentCitation,
  HistoryEntry,
  PublishedThesis,
  PublishedVersion,
  ThesisBody,
  ThesisListRow,
  VersionBody,
  WhistleblowerCall,
  WithdrawnNotice,
} from '@/types/thesis';

// ---------------------------------------------------------------------------
// THE PARSER AT THE BOUNDARY — docs/gf-ui-flows.md §8 :331–:333 ("bytes, not views"); UI plan §4 :880–:883 and
// §8 :1024–:1028 (fixture drift: the frontend's fixtures come from the appendix, so a route body that drifts from
// it passes the suite and breaks the page).
//
// A body is NARROWED here, at the read, or it is not rendered. The failure a drift produces is then a loud one,
// naming the path and the field — never a region that silently renders nothing, which is the shape a reader
// cannot tell from "there is nothing to show".
// ---------------------------------------------------------------------------

class BodyError extends Error {}

const fail = (at: string, want: string, got: unknown): never => {
  throw new BodyError(`thesis body: ${at} expected ${want}, got ${JSON.stringify(got) ?? 'undefined'}`);
};

const object = (value: unknown, at: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : fail(at, 'an object', value);

const text = (value: unknown, at: string): string => (typeof value === 'string' ? value : fail(at, 'a string', value));
const maybeText = (value: unknown, at: string): string | null => (value === null || value === undefined ? null : text(value, at));
const flag = (value: unknown, at: string): boolean => (typeof value === 'boolean' ? value : fail(at, 'a boolean', value));
const list = (value: unknown, at: string): unknown[] => (Array.isArray(value) ? value : fail(at, 'an array', value));

/**
 * ONE CHUNK OF A CITED DIFF — and the guard that makes the vocabulary a FACT rather than a hope.
 *
 * `side` WAS `text(...)` HERE, which accepted any string at all. That is how „before"/„after" — words the
 * backend has never written — reached `RecordPane` and made every chunk of a cited diff read „אחרי", with
 * `tsc` unable to see it because the type said `string` on both sides of the wire. Narrowing it at the
 * boundary means a body that drifts from `recordDiff.ts`' `ContentChunk` fails HERE, LOUDLY, NAMING THE
 * FIELD — the same shape `lib/corpusBody.ts`' `chunk` already uses for the corpus half.
 */
function recordChunk(value: unknown, at: string): { side: ChunkSide; text: string } {
  const row = object(value, at);
  const side = text(row.side, `${at}.side`);
  if (side !== 'REMOVED' && side !== 'ADDED') return fail(`${at}.side`, "'REMOVED' or 'ADDED'", side);
  return { side, text: text(row.text, `${at}.text`) };
}

function citationRef(value: unknown, at: string): CitationRef {
  const row = object(value, at);
  return { kind: text(row.kind, `${at}.kind`), name: text(row.name, `${at}.name`), pin: maybeText(row.pin, `${at}.pin`) };
}

/**
 * ONE CITATION, PARSED ONCE FOR BOTH DOORS — exported 2026-09-22 (R73 chunk 2).
 *
 * A4 :1476 rules ONE citation shape, "public and gated", so there is one parser for it. The gated working
 * view's `get_thesis_context` serves `V.mentions` in exactly this shape (`getThesisContext.ts` :71), and
 * `lib/researchBody.ts` CALLS this rather than spelling a second reader of the same fields — a second
 * spelling of one rule is this repository's dominant defect shape, and a reader is where it costs most:
 * the narrow copy that stood in `researchBody.ts` dropped five fields in silence.
 */
export function citation(value: unknown, at: string): Citation {
  const row = object(value, at);
  const kind = text(row.kind, `${at}.kind`);
  if (kind === 'TRAJECTORY') {
    if (row.resolves !== true) return { kind: 'TRAJECTORY', name: text(row.name, `${at}.name`), resolves: false };
    return {
      kind: 'TRAJECTORY',
      name: text(row.name, `${at}.name`),
      resolves: true,
      claimText: text(row.claimText, `${at}.claimText`),
      url: text(row.url, `${at}.url`),
      transitions: typeof row.transitions === 'number' ? row.transitions : fail(`${at}.transitions`, 'a number', row.transitions),
      current: flag(row.current, `${at}.current`),
    };
  }
  if (kind === 'DOCUMENT') return documentCitation(row, at);
  if (kind !== 'EVIDENCE') return fail(`${at}.kind`, "'EVIDENCE', 'TRAJECTORY' or 'DOCUMENT'", kind);
  const record = object(row.record, `${at}.record`);
  const content = object(row.content, `${at}.content`);
  const verified = object(row.verified, `${at}.verified`);
  const flagged = object(row.flag, `${at}.flag`);
  return {
    kind: 'EVIDENCE',
    name: text(row.name, `${at}.name`),
    pin: maybeText(row.pin, `${at}.pin`),
    record: {
      url: text(record.url, `${at}.record.url`),
      ...(record.capture === undefined ? {} : { capture: text(record.capture, `${at}.record.capture`) }),
      ...(record.before === undefined ? {} : { before: text(record.before, `${at}.record.before`) }),
      ...(record.after === undefined ? {} : { after: text(record.after, `${at}.record.after`) }),
    },
    content:
      content.kind === 'DIFF'
        ? {
            kind: 'DIFF',
            chunks: list(content.chunks, `${at}.content.chunks`).map((chunk, index) =>
              recordChunk(chunk, `${at}.content.chunks[${String(index)}]`),
            ),
          }
        : { kind: 'CAPTURE', text: text(content.text, `${at}.content.text`) },
    verified:
      typeof verified.notEvaluable === 'string'
        ? { notEvaluable: verified.notEvaluable }
        : {
            verified: flag(verified.verified, `${at}.verified.verified`),
            captures: list(verified.captures, `${at}.verified.captures`).map((capture, index) => {
              const row_ = object(capture, `${at}.verified.captures[${String(index)}]`);
              return {
                capture: text(row_.capture, `${at}.verified.captures[${String(index)}].capture`),
                attributed: typeof row_.attributed === 'boolean' ? row_.attributed : null,
                anchoredHashMatchesDocumentHash: flag(
                  row_.anchoredHashMatchesDocumentHash,
                  `${at}.verified.captures[${String(index)}].anchoredHashMatchesDocumentHash`,
                ),
              };
            }),
          },
    flag: flagOf(flagged, `${at}.flag`),
    argued: flag(row.argued, `${at}.argued`),
    overObjection: flag(row.overObjection, `${at}.overObjection`),
  };
}

/** A flag's reasons as the body carries them — the SAME narrowing for every citation kind that has one. */
function flagOf(value: unknown, at: string): { flagged: boolean; reasons: string[] } {
  const flagged = object(value, at);
  return {
    flagged: flag(flagged.flagged, `${at}.flagged`),
    reasons: list(flagged.reasons, `${at}.reasons`).map((reason, index) => text(reason, `${at}.reasons[${String(index)}]`)),
  };
}

/**
 * THE DOCUMENT ARM (thesis A4 :1476 as ruled, R81 QC) — every field narrowed, none defaulted. `custody` is the closed
 * pair the resolver serves (a SHED document is refused before it reaches the wire, `publishedThesis.ts`), and `title` is
 * PRESENT and possibly null: a missing key is a drift, never an untitled document.
 */
function documentCitation(row: Record<string, unknown>, at: string): DocumentCitation {
  const custody = text(row.custody, `${at}.custody`);
  if (custody !== 'HELD' && custody !== 'SEALED') return fail(`${at}.custody`, "'HELD' or 'SEALED'", custody);
  if (row.title === undefined) return fail(`${at}.title`, 'to be present — `null` is an answer, absent is not', row.title);
  return {
    kind: 'DOCUMENT',
    name: text(row.name, `${at}.name`),
    pin: text(row.pin, `${at}.pin`),
    argued: flag(row.argued, `${at}.argued`),
    title: maybeText(row.title, `${at}.title`),
    custody,
    verified: flag(row.verified, `${at}.verified`),
    flag: flagOf(row.flag, `${at}.flag`),
    overObjection: flag(row.overObjection, `${at}.overObjection`),
  };
}

function historyEntry(value: unknown, at: string): HistoryEntry {
  const row = object(value, at);
  const common = {
    versionId: text(row.versionId, `${at}.versionId`),
    contentHash: text(row.contentHash, `${at}.contentHash`),
    publishedAt: text(row.publishedAt, `${at}.publishedAt`),
  };
  if (row.withdrawn === true) return { ...common, withdrawn: true, withdrawnAt: text(row.withdrawnAt, `${at}.withdrawnAt`) };
  return { ...common, citations: list(row.citations, `${at}.citations`).map((ref, index) => citationRef(ref, `${at}.citations[${String(index)}]`)) };
}

const notice = (row: Record<string, unknown>, at: string): WithdrawnNotice => ({
  thesisId: text(row.thesisId, `${at}.thesisId`),
  withdrawn: true,
  withdrawnAt: text(row.withdrawnAt, `${at}.withdrawnAt`),
});

/** `GET /api/thesis/:id` — the published page, or the notice where it was (A5 :1565–:1569; T6 :915–:917). */
export function parseThesisBody(value: unknown): ThesisBody {
  const row = object(value, 'the thesis body');
  if (row.withdrawn === true) return notice(row, 'the notice');
  const version = object(row.version, 'version');
  const appeals = object(row.appeals, 'appeals');
  const published: PublishedThesis = {
    thesisId: text(row.thesisId, 'thesisId'),
    publicInterestStatement: maybeText(row.publicInterestStatement, 'publicInterestStatement'),
    claim: text(row.claim, 'claim'),
    provision: maybeText(row.provision, 'provision'),
    version: {
      versionId: text(version.versionId, 'version.versionId'),
      text: text(version.text, 'version.text'),
      contentHash: text(version.contentHash, 'version.contentHash'),
      publishedAt: maybeText(version.publishedAt, 'version.publishedAt'),
      author: text(version.author, 'version.author'),
    },
    citations: list(row.citations, 'citations').map((one, index) => citation(one, `citations[${String(index)}]`)),
    appeals: {
      call: list(appeals.call, 'appeals.call').map((item, index) => {
        const at = `appeals.call[${String(index)}]`;
        const row_ = object(item, at);
        return {
          whatIsNeeded: text(row_.whatIsNeeded, `${at}.whatIsNeeded`),
          whoWouldHaveSeenIt: text(row_.whoWouldHaveSeenIt, `${at}.whoWouldHaveSeenIt`),
          unit: text(row_.unit, `${at}.unit`),
          window: text(row_.window, `${at}.window`),
        };
      }),
      requests: list(appeals.requests, 'appeals.requests').map((item, index) => {
        const at = `appeals.requests[${String(index)}]`;
        const row_ = object(item, at);
        return {
          text: text(row_.text, `${at}.text`),
          authority: text(row_.authority, `${at}.authority`),
          legalBasis: text(row_.legalBasis, `${at}.legalBasis`),
          addresses: list(row_.addresses, `${at}.addresses`).map((address, at_) => text(address, `${at}.addresses[${String(at_)}]`)),
          restsOn: list(row_.restsOn, `${at}.restsOn`).map((name, at_) => text(name, `${at}.restsOn[${String(at_)}]`)),
        };
      }),
      intake: text(appeals.intake, 'appeals.intake'),
    },
    rationale: text(row.rationale, 'rationale'),
    overObjection: flag(row.overObjection, 'overObjection'),
    analysisRun: flag(row.analysisRun, 'analysisRun'),
    history: list(row.history, 'history').map((entry, index) => historyEntry(entry, `history[${String(index)}]`)),
    pages: list(row.pages, 'pages').map((page, index) => {
      const at = `pages[${String(index)}]`;
      const row_ = object(page, at);
      return { trackedUrlId: text(row_.trackedUrlId, `${at}.trackedUrlId`), url: text(row_.url, `${at}.url`) };
    }),
  };
  return published;
}

/**
 * `GET /api/thesis` — THE PUBLIC LIST, `list_theses`' anonymous answer (thesis A4 :1427): every thesis with
 * PUBLISHED(t), and "nothing else exists to an anonymous caller".
 *
 * NARROWED AT THE READ like every other public body (§8 :331–:333), field by field, each naming itself — so a
 * body that drifts from the appendix fails loudly here instead of rendering a row with a blank claim, which a
 * reader cannot tell from a thesis that has none.
 *
 * `publishedAt` is `maybeText` and not `text`: the route selects it separately from the `publishedVersionId`
 * it filters on, so a published thesis CAN answer with no date. The list orders and draws around that
 * (`app/[locale]/theses/page.tsx`); the parser's job is to report the body, not to repair it.
 */
export function parseThesisList(value: unknown): ThesisListRow[] {
  return list(value, 'the thesis list').map((row, index) => {
    const at = `theses[${String(index)}]`;
    const thesis = object(row, at);
    return {
      thesisId: text(thesis.thesisId, `${at}.thesisId`),
      claim: text(thesis.claim, `${at}.claim`),
      provision: maybeText(thesis.provision, `${at}.provision`),
      publishedAt: maybeText(thesis.publishedAt, `${at}.publishedAt`),
      author: text(thesis.author, `${at}.author`),
    };
  });
}

/** `GET /api/thesis/:id/versions/:v` — a published version, or the notice (A5 :1570). */
export function parseVersionBody(value: unknown): VersionBody {
  const row = object(value, 'the version body');
  if (row.withdrawn === true) return notice(row, 'the version notice');
  const version: PublishedVersion = {
    thesisId: text(row.thesisId, 'thesisId'),
    versionId: text(row.versionId, 'versionId'),
    text: text(row.text, 'text'),
    contentHash: text(row.contentHash, 'contentHash'),
    publishedAt: text(row.publishedAt, 'publishedAt'),
    citations: list(row.citations, 'citations').map((ref, index) => citationRef(ref, `citations[${String(index)}]`)),
  };
  return version;
}

/** `GET /api/thesis/:id/call` — the appeals, or `{ live: false }`, which is a page and never an error (A4 :1503). */
export function parseCallBody(value: unknown): WhistleblowerCall {
  const row = object(value, 'the call body');
  if (row.live !== true) return { live: false };
  const thesis = parseThesisBody({
    ...row,
    publicInterestStatement: null,
    claim: '',
    provision: null,
    version: { versionId: '', text: '', contentHash: '', publishedAt: null, author: '' },
    citations: [],
    appeals: { call: row.call, requests: row.requests, intake: row.intake },
    rationale: '',
    overObjection: false,
    analysisRun: false,
    history: [],
    pages: [],
  });
  if ('withdrawn' in thesis) return { live: false };
  return {
    live: true,
    thesisId: text(row.thesisId, 'thesisId'),
    publishedVersionId: text(row.publishedVersionId, 'publishedVersionId'),
    call: thesis.appeals.call,
    requests: thesis.appeals.requests,
    intake: thesis.appeals.intake,
  };
}
