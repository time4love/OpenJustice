import type {
  AnalysisState,
  ArticleRule,
  ArticleRules,
  AssessorVerdict,
  CaptureRow,
  Cause,
  CitedOn,
  DocumentCurrent,
  DocumentRow,
  DocumentsList,
  ContentUnit,
  ContentVersion,
  DebateRead,
  ElementFill,
  EvidenceCitation,
  EvidenceReview,
  EvidenceReviewList,
  FlagReason,
  FramingRead,
  FramingRow,
  GapDecision,
  GapEntry,
  Mention,
  ModelVoice,
  Moved,
  NamedRecord,
  NotEvaluable,
  Outcome,
  PageEntry,
  PendingStop,
  PublishedRow,
  Researcher,
  RuleHistory,
  RuleMatch,
  ThesesList,
  ThesisContext,
  ThesisOwedEntry,
  ThesisReview,
  ThesisReviewEntry,
  ThesisReviewList,
  ThesisRow,
  ThesisState,
  TrajectoryCurrency,
  Turn,
  TurnKind,
  VersionMentionRow,
  VersionView,
  Voice,
} from '@/types/research';
import { ASSESSOR_VERDICTS, AWAITING, CUSTODIES, FLAG_REASONS, GAP_DECISIONS, GATES, NOT_EVALUABLE_REASONS, OPENINGS, OUTCOMES, THREAD_STEPS, TURN_KINDS } from '@/types/research';
// ONE CITATION PARSER FOR BOTH DOORS (A4 :1476's one citation shape) — called, never re-spelled.
import { citation } from '@/lib/thesisBody';

// ---------------------------------------------------------------------------
// THE GATED BODIES AT THE BOUNDARY — one `parseX` per read, written to the appendix envelope and to the
// backend interface it names (docs/gf-ui-refactor-plan.md UI-8 :773, RULED 2026-09-20 R67 Q-A; the
// `lib/thesisBody.ts` / `lib/corpusBody.ts` precedent).
//
// A BODY IS NARROWED HERE, AT THE READ, OR IT IS NOT RENDERED. A drift then fails LOUDLY and names the field,
// rather than leaving a region that silently renders nothing — which a reader cannot tell from "there is
// nothing to show" (R63's ruling, `corpusBody.ts` :33–:37).
//
// HOW DEEP, AND WHY IT STOPS WHERE IT DOES. Every field the appendix SPELLS is narrowed. Four kinds of member
// are carried as `unknown` and narrowed by the surface that draws them: a model's own material (an assessment,
// an opinion, an ASSESSED round's content), a researcher's approved payload (a gap's `request` and `callItem`,
// which the appeals pane already owns), a stop's per-gate `material`, and the panes this step does not build
// (E3's last decision, the narrowing material, a cited pass's `changes`). Narrowing a shape no page of this
// step renders would be a parser nothing exercises, which is a parser nothing proves (`corpusBody.ts` :38–:41).
//
// A PARSER IS WRITTEN TO THE WIRE. Where the backend's own interface is wider than the appendix's prose, the
// wire wins and the difference is stated at the member: `get_debate`'s `record` and the DEBATE_OPENED turn's
// are nullable; `list_framings`' `latest.type` arrives as a bare string; every instant arrives as an ISO
// string where the backend holds a `Date`.
// ---------------------------------------------------------------------------

class ResearchBodyError extends Error {}

const fail = (at: string, want: string, got: unknown): never => {
  throw new ResearchBodyError(`research body: ${at} expected ${want}, got ${JSON.stringify(got) ?? 'undefined'}`);
};

const object = (value: unknown, at: string): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : fail(at, 'an object', value);

const list = (value: unknown, at: string): unknown[] => (Array.isArray(value) ? value : fail(at, 'an array', value));

const text = (value: unknown, at: string): string => (typeof value === 'string' ? value : fail(at, 'a string', value));

const flag = (value: unknown, at: string): boolean => (typeof value === 'boolean' ? value : fail(at, 'a boolean', value));

const count = (value: unknown, at: string): number => (typeof value === 'number' && Number.isFinite(value) ? value : fail(at, 'a number', value));

/**
 * A MEMBER THE APPENDIX SPELLS `X | null` — PRESENT, and possibly null.
 *
 * ABSENT IS NOT NULL. `null` says the platform has an answer and the answer is nothing — a turn that carries
 * no datum, a page with no title, a debate that promoted nothing. A missing key says nothing at all, and a
 * parser that read the second as the first would draw a blank row for a kind that HAS a name and would hide a
 * body that lost a field. Optional members — the ones the appendix spells `X?` — are guarded at their own
 * call sites and never through here.
 */
function present(value: unknown, at: string): unknown {
  return value === undefined ? fail(at, 'to be present — `null` is an answer, absent is not', value) : value;
}

const maybeText = (value: unknown, at: string): string | null => (present(value, at) === null ? null : text(value, at));

/**
 * A CLOSED UNION IS CLOSED HERE, and a value outside it is a drift that says so by name.
 *
 * RULED 2026-09-20 (R67, item 6) for `list_framings`' `latest.type`, and applied to every other closed union
 * the appendices spell: a fourth word means the contract moved, and a page that quietly rendered it would be
 * drawing a state no approved string exists for.
 */
function oneOf<T extends readonly (string | number)[]>(value: unknown, allowed: T, at: string): T[number] {
  return allowed.some((member) => member === value) ? (value as T[number]) : fail(at, `one of ${allowed.join(' | ')}`, value);
}

/** Every instant crosses the wire as an ISO string; a `Date` is the backend's type, never this one's. */
const instant = (value: unknown, at: string): string => text(value, at);

const maybeInstant = (value: unknown, at: string): string | null => maybeText(value, at);

/** `P` — a handle and a `mine`, read from the object that carries them (A4 :1476). */
function researcher(row: Record<string, unknown>, at: string): Researcher {
  return { handle: text(row.handle, `${at}.handle`), mine: flag(row.mine, `${at}.mine`) };
}

/** `M` — both fields NULLABLE, because the two assessors record neither today (A2 :1317's writer debt). */
function modelVoice(value: unknown, at: string): ModelVoice {
  const row = object(value, at);
  return {
    model: maybeText(row.model, `${at}.model`),
    promptVersion: maybeText(row.promptVersion, `${at}.promptVersion`),
    spentBy: researcher(object(row.spentBy, `${at}.spentBy`), `${at}.spentBy`),
  };
}

function voice(value: unknown, at: string): Voice {
  const row = object(value, at);
  const which = oneOf(row.voice, ['RESEARCHER', 'MODEL', 'PLATFORM'] as const, `${at}.voice`);
  if (which === 'RESEARCHER') return { voice: 'RESEARCHER', ...researcher(row, at) };
  if (which === 'MODEL') return { voice: 'MODEL', ...modelVoice(row, at) };
  return { voice: 'PLATFORM' };
}

/**
 * A record by its page and its archive names (evidence A1).
 *
 * THE TWO ARMS ARE TOLD APART BY `capture`, never by a `kind` the body does not carry — and a row with
 * neither is a drift, not an empty record.
 */
function namedRecord(value: unknown, at: string): NamedRecord {
  const row = object(value, at);
  const url = text(row.url, `${at}.url`);
  if (row.capture !== undefined) return { url, capture: text(row.capture, `${at}.capture`) };
  if (row.before !== undefined || row.after !== undefined) {
    return { url, before: text(row.before, `${at}.before`), after: text(row.after, `${at}.after`) };
  }
  return fail(at, 'a capture, or a before and an after', value);
}

const maybeRecord = (value: unknown, at: string): NamedRecord | null => (present(value, at) === null ? null : namedRecord(value, at));

function thesisState(value: unknown, at: string): ThesisState {
  const row = object(value, at);
  const kind = oneOf(row.kind, ['DRAFT_ONLY', 'PUBLISHED_IS_HEAD', 'PUBLISHED_BEHIND', 'WITHDRAWN'] as const, `${at}.kind`);
  if (kind === 'PUBLISHED_BEHIND') return { kind, versionsAhead: count(row.versionsAhead, `${at}.versionsAhead`) };
  if (kind === 'WITHDRAWN') return { kind, at: instant(row.at, `${at}.at`), reason: text(row.reason, `${at}.reason`) };
  return { kind };
}

const gapDecision = (value: unknown, at: string): GapDecision => oneOf(value, GAP_DECISIONS, at);

const outcome = (value: unknown, at: string): Outcome => oneOf(value, OUTCOMES, at);

/** The two words, or none — a third is a drift (the frozen copy has exactly two). */
const verdict = (value: unknown, at: string): AssessorVerdict | null =>
  value === null || value === undefined ? null : oneOf(value, ASSESSOR_VERDICTS, at);

/** The seven outcomes, all of them, zero-filled — a missing key is a count nobody can read as zero. */
function outcomes(value: unknown, at: string): Record<Outcome, number> {
  const row = object(value, at);
  const counted = {} as Record<Outcome, number>;
  for (const key of OUTCOMES) counted[key] = count(row[key], `${at}.${key}`);
  return counted;
}

function contentUnit(value: unknown, at: string): ContentUnit {
  const row = object(value, at);
  const unit: ContentUnit = { text: text(row.text, `${at}.text`) };
  if (row.side !== undefined) unit.side = oneOf(row.side, ['REMOVED', 'ADDED', 'ABSENT'] as const, `${at}.side`);
  if (row.survival !== undefined) unit.survival = oneOf(row.survival, ['SURVIVES', 'CONTRADICTED', 'UNCHECKABLE'] as const, `${at}.survival`);
  return unit;
}

const contentUnits = (value: unknown, at: string): ContentUnit[] => list(value, at).map((unit, index) => contentUnit(unit, `${at}[${String(index)}]`));

function contentVersion(value: unknown, at: string): ContentVersion {
  const row = object(value, at);
  return { hash: text(row.hash, `${at}.hash`), chunks: contentUnits(row.chunks, `${at}.chunks`) };
}

function moved(value: unknown, at: string): Moved {
  const row = object(value, at);
  return { entered: contentUnits(row.entered, `${at}.entered`), left: contentUnits(row.left, `${at}.left`) };
}

/** The cause union, accumulated — one arm per reason the content could have moved (evidence A4 :1146). */
function cause(value: unknown, at: string): Cause {
  const row = object(value, at);
  const kind = oneOf(row.kind, ['DECISION', 'EXTRACTOR', 'DIFF_VERSION', 'UNREADABLE'] as const, `${at}.kind`);
  if (kind === 'DECISION') {
    return {
      kind,
      capture: text(row.capture, `${at}.capture`),
      decisionId: text(row.decisionId, `${at}.decisionId`),
      decisionType: text(row.decisionType, `${at}.decisionType`),
      waybackTimestamp: maybeText(row.waybackTimestamp, `${at}.waybackTimestamp`),
      sequence: count(row.sequence, `${at}.sequence`),
      at: instant(row.at, `${at}.at`),
    };
  }
  if (kind === 'EXTRACTOR') {
    return { kind, capture: text(row.capture, `${at}.capture`), from: text(row.from, `${at}.from`), to: text(row.to, `${at}.to`), at: instant(row.at, `${at}.at`) };
  }
  if (kind === 'DIFF_VERSION') {
    return { kind, from: text(row.from, `${at}.from`), to: text(row.to, `${at}.to`), at: instant(row.at, `${at}.at`) };
  }
  return { kind, capture: text(row.capture, `${at}.capture`), reason: text(row.reason, `${at}.reason`) };
}

const causes = (value: unknown, at: string): Cause[] => list(value, at).map((one, index) => cause(one, `${at}[${String(index)}]`));

function citedOn(value: unknown, at: string): CitedOn {
  const row = object(value, at);
  return { versionId: text(row.versionId, `${at}.versionId`), published: flag(row.published, `${at}.published`) };
}

function trajectoryCurrency(value: unknown, at: string): TrajectoryCurrency {
  const row = object(value, at);
  return {
    state: oneOf(row.state, ['PINNED_IS_LATEST', 'RECOMPUTED_AGREES', 'RECOMPUTED_DISAGREES', 'NOT_FOLLOWED_BY_LATEST'] as const, `${at}.state`),
  };
}

function elementFill(value: unknown, at: string): ElementFill {
  const row = object(value, at);
  const records = row.records === 'MISSING' ? 'MISSING' : list(row.records, `${at}.records`).map((name, index) => text(name, `${at}.records[${String(index)}]`));
  return { element: text(row.element, `${at}.element`), records };
}

const elementFills = (value: unknown, at: string): ElementFill[] | null =>
  value === null || value === undefined ? null : list(value, at).map((one, index) => elementFill(one, `${at}[${String(index)}]`));

/**
 * A VERSION'S CITATIONS — the PUBLIC parser, CALLED (`lib/thesisBody.ts`' `citation`), never re-spelled.
 *
 * WHAT THIS REPLACED, because the shape of the defect is the point. The reader here used to keep four fields
 * — `kind`, `name`, `pin`, `argued` — and drop `record`, `content`, `verified`, `flag` and `overObjection`,
 * all of which `get_thesis_context` has served since R70 (`getThesisContext.ts` :71's `ResolvedMention`).
 * Nothing failed: the parser succeeded, the body was valid, the page drew, and the fields were simply gone.
 * That is the schema-fields-dropped class `CLAUDE.md` names as a systematic risk, and a parser is exactly
 * where it hides, because a parser that narrows looks identical to a parser that validates.
 */
const mentions = (value: unknown, at: string): Mention[] => list(value, at).map((one, index) => citation(one, `${at}[${String(index)}]`));

/** The cited page rows — `{ trackedUrlId, url }`, A4 :1476's union, deduplicated by the backend. */
const citedPages = (value: unknown, at: string): { trackedUrlId: string; url: string }[] =>
  list(value, at).map((one, index) => {
    const row = object(one, `${at}[${String(index)}]`);
    return {
      trackedUrlId: text(row.trackedUrlId, `${at}[${String(index)}].trackedUrlId`),
      url: text(row.url, `${at}[${String(index)}].url`),
    };
  });

/**
 * A VERSION TURN'S MENTION — the STORED row, and a DIFFERENT shape from the resolved one above (Q-D).
 *
 * The two live on one read: `head`/`published` carry `{ kind, name, pin, argued }` and a VERSION turn carries
 * this. Parsing the turn's rows through `mention()` accepted the fixture and would have failed on run B's real
 * body, where `pin` and `argued` are not there at all.
 */
function versionMentionRow(value: unknown, at: string): VersionMentionRow {
  const row = object(value, at);
  return {
    versionId: text(row.versionId, `${at}.versionId`),
    kind: oneOf(row.kind, ['EVIDENCE', 'TRAJECTORY'] as const, `${at}.kind`),
    name: text(row.name, `${at}.name`),
    contentVersionHash: maybeText(row.contentVersionHash, `${at}.contentVersionHash`),
    debateSessionId: maybeText(row.debateSessionId, `${at}.debateSessionId`),
  };
}

const names = (value: unknown, at: string): string[] => list(value, at).map((one, index) => text(one, `${at}[${String(index)}]`));

// ---------------------------------------------------------------------------
// THE TRANSCRIPT — one body parser per kind, and a switch that is exhaustive over the seventeen.
// ---------------------------------------------------------------------------

/**
 * A TURN.
 *
 * The switch below is exhaustive over `TurnKind` by construction: every arm returns a fully-typed member of
 * the union, and a kind added to `TURN_KINDS` without an arm leaves `kind` inhabited at the end, where the
 * compiler refuses the `never` assignment. That is the compile-time half of `every-kind-renders`; the case
 * half is `test/researchBody.test.ts`'s floor of seventeen.
 */
function turn(value: unknown, at: string): Turn {
  const row = object(value, at);
  const kind: TurnKind = oneOf(row.kind, TURN_KINDS, `${at}.kind`);
  const thread = object(row.thread, `${at}.thread`);
  const base = {
    id: text(row.id, `${at}.id`),
    at: instant(row.at, `${at}.at`),
    thread: { step: oneOf(thread.step, THREAD_STEPS, `${at}.thread.step`), id: text(thread.id, `${at}.thread.id`) },
    by: voice(row.by, `${at}.by`),
    line: maybeText(row.line, `${at}.line`),
  };
  const where = `${at}.body`;
  const body = object(row.body, where);

  switch (kind) {
    case 'FRAMING_OPENED':
      return {
        ...base,
        kind,
        body: {
          question: text(body.question, `${where}.question`),
          provision: maybeText(body.provision, `${where}.provision`),
          fromRunId: maybeText(body.fromRunId, `${where}.fromRunId`),
        },
      };
    case 'ROUND_PROPOSED':
      return {
        ...base,
        kind,
        body: {
          malformed: flag(body.malformed, `${where}.malformed`),
          framing: maybeText(body.framing, `${where}.framing`),
          elements: elementFills(body.elements, `${where}.elements`),
        },
      };
    case 'ROUND_ASSESSED':
      return {
        ...base,
        kind,
        body: {
          malformed: flag(body.malformed, `${where}.malformed`),
          content: body.content === null || body.content === undefined ? null : object(body.content, `${where}.content`),
        },
      };
    case 'ROUND_CHOSEN':
      return {
        ...base,
        kind,
        body: {
          malformed: flag(body.malformed, `${where}.malformed`),
          claim: maybeText(body.claim, `${where}.claim`),
          provision: maybeText(body.provision, `${where}.provision`),
          elements: elementFills(body.elements, `${where}.elements`),
          restatedBy: names(body.restatedBy, `${where}.restatedBy`),
        },
      };
    case 'VERSION': {
      const against = object(body.citationsVsParent, `${where}.citationsVsParent`);
      return {
        ...base,
        kind,
        body: {
          text: text(body.text, `${where}.text`),
          claim: text(body.claim, `${where}.claim`),
          contentHash: text(body.contentHash, `${where}.contentHash`),
          parentVersionId: maybeText(body.parentVersionId, `${where}.parentVersionId`),
          mentions: list(body.mentions, `${where}.mentions`).map((one, index) => versionMentionRow(one, `${where}.mentions[${String(index)}]`)),
          citationsVsParent: {
            added: names(against.added, `${where}.citationsVsParent.added`),
            repinned: names(against.repinned, `${where}.citationsVsParent.repinned`),
            dropped: names(against.dropped, `${where}.citationsVsParent.dropped`),
            carried: names(against.carried, `${where}.citationsVsParent.carried`),
          },
        },
      };
    }
    case 'DEBATE_OPENED':
      return {
        ...base,
        kind,
        body: {
          sessionId: text(body.sessionId, `${where}.sessionId`),
          record: maybeRecord(body.record, `${where}.record`),
          pin: maybeText(body.pin, `${where}.pin`),
        },
      };
    case 'RATIONALE':
    case 'RESPONSE':
      return { ...base, kind, body: { text: text(body.text, `${where}.text`) } };
    case 'ASSESSMENT':
      return {
        ...base,
        kind,
        body: {
          malformed: flag(body.malformed, `${where}.malformed`),
          hasSubstance: body.hasSubstance,
          substanceGaps: body.substanceGaps,
          verdict: verdict(body.verdict, `${where}.verdict`),
          objection: body.objection,
          assessment: body.assessment,
        },
      };
    case 'DEBATE_CLOSED':
      return {
        ...base,
        kind,
        body: {
          outcome: oneOf(body.outcome, ['PROMOTED', 'ABANDONED'] as const, `${where}.outcome`),
          overObjection: flag(body.overObjection, `${where}.overObjection`),
          evidenceFileHash: maybeText(body.evidenceFileHash, `${where}.evidenceFileHash`),
        },
      };
    case 'ANALYSIS':
      return {
        ...base,
        kind,
        body: {
          analysisId: text(body.analysisId, `${where}.analysisId`),
          inputFingerprint: text(body.inputFingerprint, `${where}.inputFingerprint`),
          current: flag(body.current, `${where}.current`),
          opinion: body.opinion,
        },
      };
    case 'GAP_DECISION':
      return {
        ...base,
        kind,
        body: {
          gapId: text(body.gapId, `${where}.gapId`),
          description: text(body.description, `${where}.description`),
          sequence: count(body.sequence, `${where}.sequence`),
          decision: gapDecision(body.decision, `${where}.decision`),
          citedName: maybeText(body.citedName, `${where}.citedName`),
          request: body.request,
          callItem: body.callItem,
          reason: maybeText(body.reason, `${where}.reason`),
          earlier: list(body.earlier, `${where}.earlier`).map((one, index) => {
            const earlier = object(one, `${where}.earlier[${String(index)}]`);
            return {
              sequence: count(earlier.sequence, `${where}.earlier[${String(index)}].sequence`),
              decision: gapDecision(earlier.decision, `${where}.earlier[${String(index)}].decision`),
              at: instant(earlier.at, `${where}.earlier[${String(index)}].at`),
            };
          }),
        },
      };
    case 'PUBLICATION_RATIONALE':
      return { ...base, kind, body: { attemptId: text(body.attemptId, `${where}.attemptId`), rationale: text(body.rationale, `${where}.rationale`) } };
    case 'PUBLICATION_ASSESSMENT':
      return {
        ...base,
        kind,
        body: { attemptId: text(body.attemptId, `${where}.attemptId`), assessment: body.assessment, verdict: verdict(body.verdict, `${where}.verdict`) },
      };
    case 'PUBLICATION_VERDICT':
      return {
        ...base,
        kind,
        body: {
          attemptId: text(body.attemptId, `${where}.attemptId`),
          outcome: oneOf(body.outcome, ['PUBLISHED', 'REFUSED'] as const, `${where}.outcome`),
          refusedBy: names(body.refusedBy, `${where}.refusedBy`),
        },
      };
    case 'WITHDRAWAL':
      return { ...base, kind, body: { versionId: text(body.versionId, `${where}.versionId`), reason: text(body.reason, `${where}.reason`) } };
    case 'NOTE':
      return { ...base, kind, body: { text: text(body.text, `${where}.text`), on: oneOf(body.on, ['THESIS', 'FRAMING'] as const, `${where}.on`) } };
  }
}

const turns = (value: unknown, at: string): Turn[] => list(value, at).map((one, index) => turn(one, `${at}[${String(index)}]`));

// ---------------------------------------------------------------------------
// THE ELEVEN READS
// ---------------------------------------------------------------------------

function versionView(value: unknown, at: string): VersionView {
  const row = object(value, at);
  return {
    versionId: text(row.versionId, `${at}.versionId`),
    by: researcher(object(row.by, `${at}.by`), `${at}.by`),
    text: text(row.text, `${at}.text`),
    claim: text(row.claim, `${at}.claim`),
    contentHash: text(row.contentHash, `${at}.contentHash`),
    createdAt: instant(row.createdAt, `${at}.createdAt`),
    mentions: mentions(row.mentions, `${at}.mentions`),
  };
}

function gapEntry(value: unknown, at: string): GapEntry {
  const row = object(value, at);
  const inForce = object(row.inForce, `${at}.inForce`);
  if (inForce.researcherId !== undefined) {
    return fail(`${at}.inForce`, 'no researcherId — no researcher id anywhere in this body (A4 :1476)', inForce.researcherId);
  }
  return {
    gapId: text(row.gapId, `${at}.gapId`),
    readsAs: gapDecision(row.readsAs, `${at}.readsAs`),
    inForce: {
      id: text(inForce.id, `${at}.inForce.id`),
      thesisId: text(inForce.thesisId, `${at}.inForce.thesisId`),
      versionId: text(inForce.versionId, `${at}.inForce.versionId`),
      gapId: text(inForce.gapId, `${at}.inForce.gapId`),
      description: text(inForce.description, `${at}.inForce.description`),
      sequence: count(inForce.sequence, `${at}.inForce.sequence`),
      decision: gapDecision(inForce.decision, `${at}.inForce.decision`),
      citedName: maybeText(inForce.citedName, `${at}.inForce.citedName`),
      request: inForce.request,
      callItem: inForce.callItem,
      reason: maybeText(inForce.reason, `${at}.inForce.reason`),
      createdAt: instant(inForce.createdAt, `${at}.inForce.createdAt`),
    },
    by: researcher(object(row.by, `${at}.by`), `${at}.by`),
  };
}

function analysisState(value: unknown, at: string): AnalysisState {
  const row = object(value, at);
  const state = oneOf(row.state, ['NONE', 'AWAITING_DERIVATION', 'CURRENT', 'STALE'] as const, `${at}.state`);
  if (state === 'NONE') {
    return row.fingerprint === undefined ? { state } : { state, fingerprint: text(row.fingerprint, `${at}.fingerprint`) };
  }
  if (state === 'AWAITING_DERIVATION') return { state, name: text(row.name, `${at}.name`) };
  if (state === 'CURRENT') {
    return {
      state,
      fingerprint: text(row.fingerprint, `${at}.fingerprint`),
      analysisId: text(row.analysisId, `${at}.analysisId`),
      runAt: instant(row.runAt, `${at}.runAt`),
      by: modelVoice(row.by, `${at}.by`),
      opinion: row.opinion,
    };
  }
  const latest = object(row.latest, `${at}.latest`);
  return {
    state,
    fingerprint: text(row.fingerprint, `${at}.fingerprint`),
    latest: {
      analysisId: text(latest.analysisId, `${at}.latest.analysisId`),
      inputFingerprint: text(latest.inputFingerprint, `${at}.latest.inputFingerprint`),
      runAt: instant(latest.runAt, `${at}.latest.runAt`),
    },
  };
}

/** `get_thesis_context` — thesis A4 :1476. The working view's ONE read. */
export function parseThesisContext(value: unknown): ThesisContext {
  const body = object(value, 'thesis context');
  const thesis = object(body.thesis, 'thesis context.thesis');
  return {
    thesis: {
      thesisId: text(thesis.thesisId, 'thesis context.thesis.thesisId'),
      provision: maybeText(thesis.provision, 'thesis context.thesis.provision'),
      by: researcher(object(thesis.by, 'thesis context.thesis.by'), 'thesis context.thesis.by'),
      headVersionId: maybeText(thesis.headVersionId, 'thesis context.thesis.headVersionId'),
      publishedVersionId: maybeText(thesis.publishedVersionId, 'thesis context.thesis.publishedVersionId'),
      publishedAt: maybeInstant(thesis.publishedAt, 'thesis context.thesis.publishedAt'),
      publicInterestStatement: maybeText(thesis.publicInterestStatement, 'thesis context.thesis.publicInterestStatement'),
      createdAt: instant(thesis.createdAt, 'thesis context.thesis.createdAt'),
      state: thesisState(thesis.state, 'thesis context.thesis.state'),
    },
    head: body.head === null || body.head === undefined ? null : versionView(body.head, 'thesis context.head'),
    published: body.published === null || body.published === undefined ? null : versionView(body.published, 'thesis context.published'),
    pages: citedPages(body.pages, 'thesis context.pages'),
    unargued: names(body.unargued, 'thesis context.unargued'),
    gapList: list(body.gapList, 'thesis context.gapList').map((one, index) => gapEntry(one, `thesis context.gapList[${String(index)}]`)),
    analysis: analysisState(body.analysis, 'thesis context.analysis'),
    framings: list(body.framings, 'thesis context.framings').map((one, index) => {
      const at = `thesis context.framings[${String(index)}]`;
      const framing = object(one, at);
      return {
        framingId: text(framing.framingId, `${at}.framingId`),
        question: text(framing.question, `${at}.question`),
        provision: maybeText(framing.provision, `${at}.provision`),
        by: researcher(object(framing.by, `${at}.by`), `${at}.by`),
        createdAt: instant(framing.createdAt, `${at}.createdAt`),
      };
    }),
    history: turns(body.history, 'thesis context.history'),
    // WHAT THIS THESIS OWES, ON ITS OWN READ (A4 :1476). `owed` is a COUNT here exactly as it is on
    // `list_thesis_reviews` (:1523), and the entries are that envelope's `E` — parsed by the ONE entry parser, so
    // a field the wire stops sending on either door is a named failure and never a silent `undefined`.
    owed: count(body.owed, 'thesis context.owed'),
    reviews: list(body.reviews, 'thesis context.reviews').map((one, index) => thesisOwedEntry(one, `thesis context.reviews[${String(index)}]`)),
  };
}

/** `get_framing` — thesis A4 :1459. `rounds` and `researcherId` are retired; the thread arrives as turns. */
export function parseFraming(value: unknown): FramingRead {
  const body = object(value, 'framing');
  return {
    framingId: text(body.framingId, 'framing.framingId'),
    question: text(body.question, 'framing.question'),
    provision: maybeText(body.provision, 'framing.provision'),
    thesisId: maybeText(body.thesisId, 'framing.thesisId'),
    by: researcher(object(body.by, 'framing.by'), 'framing.by'),
    turns: turns(body.turns, 'framing.turns'),
  };
}

/** `get_debate` — evidence A4 :1144. `record` is NAMED, and `events` is retired with the builder. */
export function parseDebate(value: unknown): DebateRead {
  const body = object(value, 'debate');
  return {
    sessionId: text(body.sessionId, 'debate.sessionId'),
    thesisId: text(body.thesisId, 'debate.thesisId'),
    fileHash: text(body.fileHash, 'debate.fileHash'),
    record: maybeRecord(body.record, 'debate.record'),
    status: text(body.status, 'debate.status'),
    hasSubstance: flag(body.hasSubstance, 'debate.hasSubstance'),
    verdict: verdict(body.verdict, 'debate.verdict'),
    canPromote: flag(body.canPromote, 'debate.canPromote'),
    blockedBy: names(body.blockedBy, 'debate.blockedBy'),
    promotedOverObjection: flag(body.promotedOverObjection, 'debate.promotedOverObjection'),
    evidenceFileHash: maybeText(body.evidenceFileHash, 'debate.evidenceFileHash'),
    turns: turns(body.turns, 'debate.turns'),
  };
}

function thesisRow(value: unknown, at: string): ThesisRow {
  const row = object(value, at);
  return {
    thesisId: text(row.thesisId, `${at}.thesisId`),
    state: thesisState(row.state, `${at}.state`),
    claim: maybeText(row.claim, `${at}.claim`),
    provision: maybeText(row.provision, `${at}.provision`),
    headVersionId: maybeText(row.headVersionId, `${at}.headVersionId`),
    publishedVersionId: maybeText(row.publishedVersionId, `${at}.publishedVersionId`),
    headIsPublished: flag(row.headIsPublished, `${at}.headIsPublished`),
    framingIds: names(row.framingIds, `${at}.framingIds`),
    unarguedMentions: count(row.unarguedMentions, `${at}.unarguedMentions`),
    openGaps: count(row.openGaps, `${at}.openGaps`),
    author: text(row.author, `${at}.author`),
    mine: flag(row.mine, `${at}.mine`),
  };
}

function publishedRow(value: unknown, at: string): PublishedRow {
  const row = object(value, at);
  return {
    thesisId: text(row.thesisId, `${at}.thesisId`),
    claim: text(row.claim, `${at}.claim`),
    provision: maybeText(row.provision, `${at}.provision`),
    publishedAt: maybeInstant(row.publishedAt, `${at}.publishedAt`),
    author: text(row.author, `${at}.author`),
    contentHash: text(row.contentHash, `${at}.contentHash`),
  };
}

/**
 * `list_theses` — thesis A4 :1429.
 *
 * `author` and `mine` ARE REQUIRED: the route fixes `scope: 'all'` (`researchRoutes.ts` :38) and the envelope
 * gives both at `all`. A row without them is a body from the other scope, which this door cannot answer.
 */
export function parseThesesList(value: unknown): ThesesList {
  const body = object(value, 'theses');
  return {
    theses: list(body.theses, 'theses.theses').map((one, index) => thesisRow(one, `theses.theses[${String(index)}]`)),
    published: list(body.published, 'theses.published').map((one, index) => publishedRow(one, `theses.published[${String(index)}]`)),
  };
}

/** `list_framings` — thesis A4 :1432. A bare ARRAY, no envelope key; `[]` is an answer. */
export function parseFramings(value: unknown): FramingRow[] {
  return list(value, 'framings').map((one, index) => {
    const at = `framings[${String(index)}]`;
    const row = object(one, at);
    const latest = row.latest;
    return {
      framingId: text(row.framingId, `${at}.framingId`),
      question: text(row.question, `${at}.question`),
      provision: maybeText(row.provision, `${at}.provision`),
      author: text(row.author, `${at}.author`),
      thesisId: maybeText(row.thesisId, `${at}.thesisId`),
      openedAt: instant(row.openedAt, `${at}.openedAt`),
      rounds: count(row.rounds, `${at}.rounds`),
      // THE WIRE SAYS `string` AND THE APPENDIX SAYS THREE WORDS (`listFramings.ts` :41 vs A4 :1432). The
      // appendix decides, and a fourth word fails by name — RULED 2026-09-20 (R67, item 6).
      latest:
        latest === null || latest === undefined
          ? null
          : {
              sequence: count(object(latest, `${at}.latest`).sequence, `${at}.latest.sequence`),
              type: oneOf(object(latest, `${at}.latest`).type, ['PROPOSED', 'ASSESSED', 'CHOSEN'] as const, `${at}.latest.type`),
            },
      claim: maybeText(row.claim, `${at}.claim`),
    };
  });
}

/**
 * ONE THING OWED, AS THE ENTRY ALONE — A4 :1476's `E`, the shape BOTH doors carry.
 *
 * `get_thesis_context` serves exactly this per thesis; `list_thesis_reviews` serves it under what the LIST adds.
 * Parsing it once is what stops the two envelopes' shared union drifting into two readings of one name.
 */
function thesisReviewEntry(value: unknown, at: string): ThesisReviewEntry {
  const row = object(value, at);
  const kind = oneOf(row.kind, ['FLAGGED', 'STALE_TRAJECTORY', 'UNARGUED'] as const, `${at}.kind`);
  const common = {
    thesisId: text(row.thesisId, `${at}.thesisId`),
    name: text(row.name, `${at}.name`),
    command: text(row.command, `${at}.command`),
  };
  if (kind === 'FLAGGED') {
    return {
      ...common,
      kind,
      versionId: text(row.versionId, `${at}.versionId`),
      mentionId: text(row.mentionId, `${at}.mentionId`),
      reasons: list(row.reasons, `${at}.reasons`).map((reason, index): FlagReason => oneOf(reason, FLAG_REASONS, `${at}.reasons[${String(index)}]`)),
    };
  }
  if (kind === 'STALE_TRAJECTORY') {
    return {
      ...common,
      kind,
      citedOn: list(row.citedOn, `${at}.citedOn`).map((one, index) => citedOn(one, `${at}.citedOn[${String(index)}]`)),
      state: trajectoryCurrency({ state: row.state }, at).state,
    };
  }
  return {
    ...common,
    kind,
    versionId: text(row.versionId, `${at}.versionId`),
    mentionId: text(row.mentionId, `${at}.mentionId`),
  };
}

/**
 * A4 :1476's ROW — `E` AND THE PAIRING, checked AS A PAIRING and not as two nullable fields.
 *
 * THE THREE COMBINATIONS ARE THE CONTRACT (the researcher, 2026-09-22): FLAGGED `{ record, owedSince: null }` ·
 * UNARGUED `{ record, owedSince }` · STALE_TRAJECTORY `{ record: null, owedSince }`. A parser that accepted
 * `R | null` beside `ISO | null` would pass a FLAGGED entry carrying a date — the one the appendix refuses,
 * because it could only be `publishedAt`, a LOWER BOUND that overstates how long a flag has been open — and a
 * STALE entry carrying a record, which no arm of REVIEWS has. `null` is checked, never defaulted: absent is a
 * field the wire stopped sending and fails by name (`present`'s rule, :96–:99).
 */
function thesisOwedEntry(value: unknown, at: string): ThesisOwedEntry {
  const row = object(value, at);
  const entry = thesisReviewEntry(value, at);

  if (entry.kind === 'STALE_TRAJECTORY') {
    if (present(row.record, `${at}.record`) !== null) {
      fail(`${at}.record`, 'null — a trajectory citation names no record on any arm of REVIEWS', row.record);
    }
    return { ...entry, record: null, owedSince: instant(row.owedSince, `${at}.owedSince`) };
  }

  const record = namedRecord(row.record, `${at}.record`);
  if (entry.kind === 'FLAGGED') {
    if (present(row.owedSince, `${at}.owedSince`) !== null) {
      fail(`${at}.owedSince`, "null — FLAGGED's date is the citation sheet's (ui §11 :404)", row.owedSince);
    }
    return { ...entry, record, owedSince: null };
  }
  return { ...entry, record, owedSince: instant(row.owedSince, `${at}.owedSince`) };
}

function thesisReview(value: unknown, at: string): ThesisReview {
  const row = object(value, at);
  const entry = thesisReviewEntry(value, at);
  const common = {
    owedSince: instant(row.owedSince, `${at}.owedSince`),
    author: text(row.author, `${at}.author`),
    mine: flag(row.mine, `${at}.mine`),
  };
  const material = object(row.material, `${at}.material`);

  if (entry.kind === 'FLAGGED') {
    return {
      ...common,
      ...entry,
      material: {
        versionId: text(material.versionId, `${at}.material.versionId`),
        record: namedRecord(material.record, `${at}.material.record`),
        pin: contentVersion(material.pin, `${at}.material.pin`),
        current: material.current === null || material.current === undefined ? null : contentVersion(material.current, `${at}.material.current`),
        moved: material.moved === null || material.moved === undefined ? null : moved(material.moved, `${at}.material.moved`),
        cause: causes(material.cause, `${at}.material.cause`),
        decision: present(material.decision, `${at}.material.decision`),
      },
    };
  }

  if (entry.kind === 'STALE_TRAJECTORY') {
    const cited = object(material.cited, `${at}.material.cited`);
    const computation = object(cited.computation, `${at}.material.cited.computation`);
    return {
      ...common,
      ...entry,
      material: {
        citedOn: list(material.citedOn, `${at}.material.citedOn`).map((one, index) => citedOn(one, `${at}.material.citedOn[${String(index)}]`)),
        cited: {
          claimText: text(cited.claimText, `${at}.material.cited.claimText`),
          url: text(cited.url, `${at}.material.cited.url`),
          finalState: text(cited.finalState, `${at}.material.cited.finalState`),
          changes: cited.changes,
          computation: {
            id: text(computation.id, `${at}.material.cited.computation.id`),
            computedAt: instant(computation.computedAt, `${at}.material.cited.computation.computedAt`),
          },
        },
        currency: trajectoryCurrency(material.currency, `${at}.material.currency`),
      },
    };
  }

  return {
    ...common,
    ...entry,
    material: {
      versionId: text(material.versionId, `${at}.material.versionId`),
      record: namedRecord(material.record, `${at}.material.record`),
      pin: text(material.pin, `${at}.material.pin`),
    },
  };
}

/** `list_thesis_reviews` — thesis A4 :1523. `{ owed: 0, reviews: [] }` is an answer, not an absence. */
export function parseThesisReviews(value: unknown): ThesisReviewList {
  const body = object(value, 'reviews');
  return {
    owed: count(body.owed, 'reviews.owed'),
    reviews: list(body.reviews, 'reviews.reviews').map((one, index) => thesisReview(one, `reviews.reviews[${String(index)}]`)),
  };
}

function evidenceCitation(value: unknown, at: string): EvidenceCitation {
  const row = object(value, at);
  const argument = row.argument;
  return {
    thesisId: text(row.thesisId, `${at}.thesisId`),
    versionId: text(row.versionId, `${at}.versionId`),
    published: flag(row.published, `${at}.published`),
    argument:
      argument === null || argument === undefined
        ? null
        : {
            debateSessionId: text(object(argument, `${at}.argument`).debateSessionId, `${at}.argument.debateSessionId`),
            argued: flag(object(argument, `${at}.argument`).argued, `${at}.argument.argued`),
          },
  };
}

function evidenceReview(value: unknown, at: string): EvidenceReview {
  const row = object(value, at);
  return {
    kind: oneOf(row.kind, ['CONTENT_MOVED'] as const, `${at}.kind`),
    fileHash: text(row.fileHash, `${at}.fileHash`),
    record: namedRecord(row.record, `${at}.record`),
    owedSince: instant(row.owedSince, `${at}.owedSince`),
    decisionSequence: count(row.decisionSequence, `${at}.decisionSequence`),
    affirmed: contentVersion(row.affirmed, `${at}.affirmed`),
    current: contentVersion(row.current, `${at}.current`),
    moved: moved(row.moved, `${at}.moved`),
    cause: causes(row.cause, `${at}.cause`),
    citedBy: list(row.citedBy, `${at}.citedBy`).map((one, index) => evidenceCitation(one, `${at}.citedBy[${String(index)}]`)),
    narrowed: present(row.narrowed, `${at}.narrowed`),
    commands: names(row.commands, `${at}.commands`),
  };
}

function notEvaluable(value: unknown, at: string): NotEvaluable {
  const row = object(value, at);
  return {
    fileHash: text(row.fileHash, `${at}.fileHash`),
    record: maybeRecord(row.record, `${at}.record`),
    reason: oneOf(row.reason, NOT_EVALUABLE_REASONS, `${at}.reason`),
    detail: text(row.detail, `${at}.detail`),
  };
}

/** `list_evidence_reviews` — evidence A4 :1146. `notEvaluable` is named, never absent and never a count. */
export function parseEvidenceReviews(value: unknown): EvidenceReviewList {
  const body = object(value, 'evidence reviews');
  return {
    owed: count(body.owed, 'evidence reviews.owed'),
    reviews: list(body.reviews, 'evidence reviews.reviews').map((one, index) => evidenceReview(one, `evidence reviews.reviews[${String(index)}]`)),
    notEvaluable: list(body.notEvaluable, 'evidence reviews.notEvaluable').map((one, index) =>
      notEvaluable(one, `evidence reviews.notEvaluable[${String(index)}]`),
    ),
  };
}

/** `list_pages` — interaction A5 :1071. A bare ARRAY; it refuses nothing. */
export function parsePages(value: unknown): PageEntry[] {
  return list(value, 'pages').map((one, index) => {
    const at = `pages[${String(index)}]`;
    const row = object(one, at);
    return {
      trackedUrlId: text(row.trackedUrlId, `${at}.trackedUrlId`),
      url: text(row.url, `${at}.url`),
      // NOT DEFAULTED, EITHER WAY — the same reading `corpusBody.ts` records for the facet's `public`: a
      // default would decide a DISCLOSURE question by accident, and this is the field the NOT PUBLIC mark
      // is drawn from.
      public: flag(row.public, `${at}.public`),
      title: maybeText(row.title, `${at}.title`),
      surveyedAt: instant(row.surveyedAt, `${at}.surveyedAt`),
      total: count(row.total, `${at}.total`),
      outcomes: outcomes(row.outcomes, `${at}.outcomes`),
      stopPending: flag(row.stopPending, `${at}.stopPending`),
    };
  });
}

/** `list_captures` — interaction A5 :1208. A bare ARRAY in timestamp order. */
export function parseCaptures(value: unknown): CaptureRow[] {
  return list(value, 'captures').map((one, index) => {
    const at = `captures[${String(index)}]`;
    const row = object(one, at);
    return {
      capture: text(row.capture, `${at}.capture`),
      snapshotDate: text(row.snapshotDate, `${at}.snapshotDate`),
      outcome: outcome(row.outcome, `${at}.outcome`),
      digest: text(row.digest, `${at}.digest`),
      comparedTo: maybeText(row.comparedTo, `${at}.comparedTo`),
      rulesetId: maybeText(row.rulesetId, `${at}.rulesetId`),
      snapshotId: maybeText(row.snapshotId, `${at}.snapshotId`),
      stale: flag(row.stale, `${at}.stale`),
      stopGates:
        row.stopGates === null || row.stopGates === undefined
          ? null
          : list(row.stopGates, `${at}.stopGates`).map((gate, gateIndex) => oneOf(gate, GATES, `${at}.stopGates[${String(gateIndex)}]`)),
    };
  });
}

function articleRule(value: unknown, at: string): ArticleRule {
  const row = object(value, at);
  return {
    ruleId: text(row.ruleId, `${at}.ruleId`),
    selector: text(row.selector, `${at}.selector`),
    validFrom: text(row.validFrom, `${at}.validFrom`),
    validTo: maybeText(row.validTo, `${at}.validTo`),
    trusted: flag(row.trusted, `${at}.trusted`),
    lastMatched: maybeText(row.lastMatched, `${at}.lastMatched`),
  };
}

function pendingStop(value: unknown, at: string): PendingStop {
  const row = object(value, at);
  return {
    capture: text(row.capture, `${at}.capture`),
    gates: list(row.gates, `${at}.gates`).map((one, index) => {
      const gate = object(one, `${at}.gates[${String(index)}]`);
      return { gate: oneOf(gate.gate, GATES, `${at}.gates[${String(index)}].gate`), material: gate.material };
    }),
    markingUrl: text(row.markingUrl, `${at}.markingUrl`),
  };
}

/** `get_article_rules` — interaction A5 :1199. `decisions` is a COUNT; `markingUrl` arrives and is never an anchor. */
export function parseArticleRules(value: unknown): ArticleRules {
  const body = object(value, 'article rules');
  return {
    rules: list(body.rules, 'article rules.rules').map((one, index) => articleRule(one, `article rules.rules[${String(index)}]`)),
    pendingStop: body.pendingStop === null || body.pendingStop === undefined ? null : pendingStop(body.pendingStop, 'article rules.pendingStop'),
    counts: outcomes(body.counts, 'article rules.counts'),
    stale: count(body.stale, 'article rules.stale'),
    decisions: count(body.decisions, 'article rules.decisions'),
    lastDecisionAt: maybeInstant(body.lastDecisionAt, 'article rules.lastDecisionAt'),
  };
}

function ruleMatch(value: unknown, at: string): RuleMatch {
  const row = object(value, at);
  return {
    capture: text(row.capture, `${at}.capture`),
    outcome: outcome(row.outcome, `${at}.outcome`),
    matchedNodes: count(row.matchedNodes, `${at}.matchedNodes`),
    // NULL IS A FACT AND `[]` IS A DIFFERENT CLAIM (A5 :1218–:1222): null means the corpus holds no body to
    // re-derive from; an empty array means the rule removed nothing.
    removed: row.removed === null || row.removed === undefined ? null : names(row.removed, `${at}.removed`),
    removedCount: row.removedCount === null || row.removedCount === undefined ? null : count(row.removedCount, `${at}.removedCount`),
  };
}

/** `get_rule_history` — interaction A5 :1214. Every match; the route passes no `maxCaptures`. */
export function parseRuleHistory(value: unknown): RuleHistory {
  const body = object(value, 'rule history');
  const rule = object(body.rule, 'rule history.rule');
  return {
    rule: {
      ruleId: text(rule.ruleId, 'rule history.rule.ruleId'),
      selector: text(rule.selector, 'rule history.rule.selector'),
      validFrom: text(rule.validFrom, 'rule history.rule.validFrom'),
      validTo: maybeText(rule.validTo, 'rule history.rule.validTo'),
      trusted: flag(rule.trusted, 'rule history.rule.trusted'),
      createdAt: instant(rule.createdAt, 'rule history.rule.createdAt'),
      createdById: text(rule.createdById, 'rule history.rule.createdById'),
      decisions: list(rule.decisions, 'rule history.rule.decisions').map((one, index) => {
        const at = `rule history.rule.decisions[${String(index)}]`;
        const decision = object(one, at);
        return {
          type: text(decision.type, `${at}.type`),
          waybackTimestamp: maybeText(decision.waybackTimestamp, `${at}.waybackTimestamp`),
          researcherId: text(decision.researcherId, `${at}.researcherId`),
          createdAt: instant(decision.createdAt, `${at}.createdAt`),
        };
      }),
    },
    matches: list(body.matches, 'rule history.matches').map((one, index) => ruleMatch(one, `rule history.matches[${String(index)}]`)),
  };
}

/** CURRENT(d) — `{ contentVersionHash }` or `{ awaiting }` (A4 :1434 as ruled 2026-09-23); never null, never a bare hash. */
function currentOf(value: unknown, at: string): DocumentCurrent {
  const current = object(value, at);
  if ('awaiting' in current) return { awaiting: oneOf(current.awaiting, AWAITING, `${at}.awaiting`) };
  return { contentVersionHash: text(current.contentVersionHash, `${at}.contentVersionHash`) };
}

/**
 * `list_documents` — document flows A4 :1434, the envelope AS RULED 2026-09-23. Every field the line names is read and
 * NONE is defaulted: `by` is `{ handle, mine }` or null (a public-door arrival, step 32), `anchored` a boolean,
 * `derivedFrom` a commitment with its title or null — a drifted field fails here by name, never as a blank row.
 */
export function parseDocuments(value: unknown): DocumentsList {
  const body = object(value, 'documents');
  const documents = list(body.documents, 'documents.documents').map((one, index): DocumentRow => {
    const at = `documents.documents[${String(index)}]`;
    const row = object(one, at);
    const assertions = object(row.assertions, `${at}.assertions`);
    const derived = present(assertions.derivedFrom, `${at}.assertions.derivedFrom`);
    const derivedRow = derived === null ? null : object(derived, `${at}.assertions.derivedFrom`);
    const by = present(row.by, `${at}.by`);
    return {
      commitment: text(row.commitment, `${at}.commitment`),
      title: maybeText(row.title, `${at}.title`),
      custody: oneOf(row.custody, CUSTODIES, `${at}.custody`),
      mimeType: text(row.mimeType, `${at}.mimeType`),
      byteLength: count(row.byteLength, `${at}.byteLength`),
      receivedAt: instant(row.receivedAt, `${at}.receivedAt`),
      assertions: {
        assertedUrl: maybeText(assertions.assertedUrl, `${at}.assertions.assertedUrl`),
        assertedAt: maybeText(assertions.assertedAt, `${at}.assertions.assertedAt`),
        derivedFrom:
          derivedRow === null
            ? null
            : { commitment: text(derivedRow.commitment, `${at}.assertions.derivedFrom.commitment`), title: maybeText(derivedRow.title, `${at}.assertions.derivedFrom.title`) },
      },
      current: currentOf(row.current, `${at}.current`),
      anchored: flag(row.anchored, `${at}.anchored`),
      citedBy: list(row.citedBy, `${at}.citedBy`).map((cited, n) => {
        const entry = object(cited, `${at}.citedBy[${String(n)}]`);
        return { thesisId: text(entry.thesisId, `${at}.citedBy[${String(n)}].thesisId`), published: flag(entry.published, `${at}.citedBy[${String(n)}].published`) };
      }),
      opening: present(row.opening, `${at}.opening`) === null ? null : oneOf(row.opening, OPENINGS, `${at}.opening`),
      by: by === null ? null : researcher(object(by, `${at}.by`), `${at}.by`),
    };
  });
  return { documents, uploadUrl: text(body.uploadUrl, 'documents.uploadUrl') };
}
