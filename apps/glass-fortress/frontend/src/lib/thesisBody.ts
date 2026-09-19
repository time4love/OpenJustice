import type {
  Citation,
  CitationRef,
  HistoryEntry,
  PublishedThesis,
  PublishedVersion,
  ThesisBody,
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

function citationRef(value: unknown, at: string): CitationRef {
  const row = object(value, at);
  return { kind: text(row.kind, `${at}.kind`), name: text(row.name, `${at}.name`), pin: maybeText(row.pin, `${at}.pin`) };
}

function citation(value: unknown, at: string): Citation {
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
  if (kind !== 'EVIDENCE') return fail(`${at}.kind`, "'EVIDENCE' or 'TRAJECTORY'", kind);
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
            chunks: list(content.chunks, `${at}.content.chunks`).map((chunk, index) => {
              const row_ = object(chunk, `${at}.content.chunks[${String(index)}]`);
              return { side: text(row_.side, `${at}.content.chunks[${String(index)}].side`), text: text(row_.text, `${at}.content.chunks[${String(index)}].text`) };
            }),
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
    flag: {
      flagged: flag(flagged.flagged, `${at}.flag.flagged`),
      reasons: list(flagged.reasons, `${at}.flag.reasons`).map((reason, index) => text(reason, `${at}.flag.reasons[${String(index)}]`)),
    },
    argued: flag(row.argued, `${at}.argued`),
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
