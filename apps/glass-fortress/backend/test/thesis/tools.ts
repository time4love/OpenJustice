import { isDeepStrictEqual } from 'node:util';
import { AFTER, BEFORE, DIFF_NAME, DIFF_ROW, CURRENT_VERSION, PAGE, URL } from '../helpers/corpusFixture';
import { asked, db, rolledBack, store, written, writtenViaTx, type Row, type Write } from '../helpers/evidenceDouble';
import { built } from './absent';
import { MODULES, TOOLS, type ThesisCode, type ThesisRow, type ToolName, type WriteToolOnAThesis } from './contract';
import { CLAIM, FRAMING, MENTION, NOTE, OPEN_GAP, PROVISION, ROUNDS, THESIS, TRAJECTORY_ID, VERSION, VERSION_TEXT } from './fixtures';
import { mentionRow } from './rows';

// ---------------------------------------------------------------------------
// THE TOOL HARNESS OF THE THESIS ACCEPTANCE SUITE — sketch §3a, 7.3.
//
// ONE WAY TO REACH A TOOL. Every handler is loaded through `built()`, by the module
// path and export name `contract.ts` gives it, so each case fails BY NAME with the
// step that owes the tool (`test/thesis/absent.ts` says why never a literal import).
//
// THE FOUR THINGS EVERY REFUSAL CASE ASSERTS (§3a; thesis A4 :1418–:1423, evidence A4
// :1067–:1078, flows A5 :1034–:1039): the handler RESOLVES and never throws; its JSON
// is exactly `{ error, code }`; NOTHING WAS WRITTEN; NOTHING WAS SPENT —
// `factories/LLMFactory` is replaced by a TRIPWIRE that records and throws on any
// call, and `tripped` stays empty. The tripwire is not a model double: there is no
// model in step 17, and nothing is asserted about one.
//
// "NOTHING WAS WRITTEN" IS "NOTHING WAS COMMITTED": the double's attempt log minus
// what a rejected transaction took back (`rolledBack`, the double says why). Q1's
// STALE_PIN is decided INSIDE the version write's transaction, where a write may
// precede the refusal and a database rolls it back; every other refusal is decided
// before any write and so leaves the attempt log empty as well.
//
// THE ORDER (§3a, §6-14 — step 13's ruling 5 extended): NO_RESEARCHER · NO_THESIS ·
// NOT_AUTHOR, then the arguments, then content. An ANONYMOUS call leaves the double's
// `asked` log EMPTY — and, as a PROPERTY rather than a list, calls NO delegate of the
// double at all: `asked` records only the delegates wrapped to record, so it alone
// would be an enumeration standing for the rule.
//
// THE CODE-SET EQUALITY (§3a): per tool, the codes its refusal cases actually
// PRODUCED, with the codes OWED to a later step, equal `contract.ts`'s set exactly —
// a code neither dropped nor claimed tested. The produced half is collected as each
// case passes, so a case that never reached its refusal leaves its code missing.
//
// THE DOUBLE IS READ AS IT IS. Where a refusal needs the corpus — NOT_A_RECORD,
// NOT_ACQUIRED, AWAITING_DERIVATION, UNKNOWN_TRAJECTORY_ID — the world below seeds
// the rows the double holds today; the step that builds each tool reads the double
// as it then is and extends it ADDITIVELY where its queries need more (the 7.2
// precedent), every consumer of the double unedited as the proof.
// ---------------------------------------------------------------------------

// --- the researcher in context ---------------------------------------------

const identity: { researcherId: string | null } = { researcherId: null };

/**
 * What every tool file mocks `context/researcherContext` with — the
 * `test/walk/resolveScanStop.test.ts` :14–:15 shape, shared, and reached through
 * `require` inside the `jest.mock` factory for the hoisting reason the double states.
 */
export const researcherContextDouble = {
  getResearcherId: (): string | null => identity.researcherId,
};

// --- the tripwire ------------------------------------------------------------

/** Every call into the model factory a case caused, in order — what "nothing spent" is checked against. */
export const tripped: string[] = [];

function trip(what: string): never {
  tripped.push(what);
  throw new Error(
    `LLMFactory TRIPWIRE — ${what} was called. A refusal spends nothing, and step 17 doubles no model (sketch §3a, §6-7).`,
  );
}

/** What every tool file mocks `factories/LLMFactory` with: calling any member of the factory trips. */
export const llmFactoryTripwire = {
  LLMFactory: new Proxy<Record<string, unknown>>({}, { get: (_factory, member) => (): never => trip(`LLMFactory.${String(member)}`) }),
  resolveModelId: (): never => trip('resolveModelId'),
};

/**
 * Put `researcher` in context (null: no one) for a call that is not a tool's — a
 * PUBLIC route, which must answer identically either way (7.5b). A tool call sets it
 * through `call`.
 */
export function actAs(researcher: string | null): void {
  identity.researcherId = researcher;
}

/** From each file's `beforeEach`, after `resetDouble`. */
export function resetTools(): void {
  tripped.length = 0;
  identity.researcherId = null;
}

/** A case that makes two calls asks "nothing written" of the SECOND one; this forgets the first's writes and reads. */
export function forgetTheFirstCall(): void {
  written.length = 0;
  writtenViaTx.length = 0;
  rolledBack.length = 0;
  asked.length = 0;
}

/** What the case COMMITTED: every write attempted, minus what a rejected transaction took back. */
export function committed(): Write[] {
  return written.filter((w) => !rolledBack.includes(w));
}

/**
 * Every delegate method of the shared double called in this case, as `model.op` —
 * the jest config's `clearMocks` empties them before each case. The ORDER's property:
 * a call refused before any query leaves this empty, whichever delegates it would
 * have asked.
 */
export function delegatesCalled(): string[] {
  return Object.entries(db).flatMap(([model, delegate]) => {
    if (jest.isMockFunction(delegate)) return delegate.mock.calls.length > 0 ? [model] : [];
    const methods: Readonly<Record<string, unknown>> = delegate;
    return Object.entries(methods).flatMap(([op, method]) =>
      jest.isMockFunction(method) && method.mock.calls.length > 0 ? [`${model}.${op}`] : [],
    );
  });
}

// --- reaching a handler --------------------------------------------------------

export type Handler = (input: Readonly<Record<string, unknown>>) => Promise<string>;

/** The tool's handler, by the export name `contract.ts` gives it — red by name until its step. */
export async function handlerOf(tool: ToolName): Promise<Handler> {
  const module = TOOLS[tool].module;
  const name = Object.keys(MODULES[module].exports).find((key) => key.endsWith('Handler'));
  if (name === undefined) throw new Error(`contract.ts names no handler export for ${tool}`);
  const loaded = await built<Record<string, Handler | undefined>>(module, [name]);
  const handler = loaded[name];
  if (handler === undefined) throw new Error(`${module} loaded without ${name}`);
  return handler;
}

/** One call, as `researcher` (null: no one), which must RESOLVE — a throw fails the case in these words. */
export async function call(
  tool: ToolName,
  input: Readonly<Record<string, unknown>>,
  researcher: string | null,
): Promise<string> {
  const handler = await handlerOf(tool);
  identity.researcherId = researcher;
  try {
    return await handler(input);
  } catch (err) {
    throw new Error(
      `${tool} THREW — every refusal is a JSON { error, code }, never a throw (thesis A4 :1418): ` +
        (err instanceof Error ? err.message : String(err)),
    );
  }
}

// --- refusals ------------------------------------------------------------------

const produced = new Map<ToolName, Set<ThesisCode>>();

/** §3a's four things, and the code recorded as produced once they hold. */
export function expectRefusal(tool: ToolName, out: string, code: ThesisCode): void {
  const body: unknown = JSON.parse(out);
  expect(body).toEqual({ error: expect.stringMatching(/\S/) as unknown, code });
  expect(committed()).toEqual([]);
  expect(tripped).toEqual([]);
  const seen = produced.get(tool) ?? new Set<ThesisCode>();
  seen.add(code);
  produced.set(tool, seen);
}

export interface RefusalCase {
  code: ThesisCode;
  /** What makes this call refuse — the case title's tail. */
  why: string;
  /** The researcher in context; null is an anonymous call. */
  as: string | null;
  input: Readonly<Record<string, unknown>>;
  /** The world the call meets, set before it — may load a module a case needs to compute a row. */
  seed?: () => unknown;
  /**
   * The refusal is decided from the INPUT alone, before any row is looked up — as
   * `add_note`'s NEITHER is (it decides which row to look up). NO_RESEARCHER always is.
   */
  beforeAnyQuery?: boolean;
  /**
   * What the refusal's `error` must NAME (the R42 follow-up, M5): any ONE of these
   * spellings, each a set of strings that must ALL appear in it. An `error` is
   * otherwise only non-empty — its words are the builder's — but where the contract
   * says what a refusal names, the case holds it by VALUE.
   */
  names?: readonly (readonly string[])[];
}

/**
 * THE FIXTURE'S DIFF, as a refusal may name it. AWAITING_DERIVATION "names the diff"
 * (thesis A4 :1422–:1423; T2 :414; T4 :583), and a record is named as evidence A1 says:
 * by its computed name — DIFF_NAME, the first spelling — or as `{ url, before, after }`
 * (evidence A1 :890–:891), "by page and timestamps" (evidence A4 :1069) — the second,
 * which therefore carries the PAGE with the pair's two timestamps (round 4). The
 * REVIEWER's round-1 ruling that admitted the timestamps alone rested on built code
 * (`pairName`), which is not a ground under the house rule; the appendix wins.
 */
export const NAMES_THE_DIFF: readonly (readonly string[])[] = [
  [DIFF_NAME],
  [URL, BEFORE.waybackTimestamp, AFTER.waybackTimestamp],
];

/** One case per refusal, each asserting §3a's four things — and, for NO_RESEARCHER, the ORDER. */
export function refusals(tool: ToolName, cases: readonly RefusalCase[]): void {
  for (const c of cases) {
    it(`${tool} refuses ${c.code} — ${c.why}`, async () => {
      await c.seed?.();
      const out = await call(tool, c.input, c.as);
      expectRefusal(tool, out, c.code);
      if (c.names !== undefined) {
        // The error rides in the failure line, so a miss shows what WAS said.
        const error = String((JSON.parse(out) as { error: unknown }).error);
        expect([error, c.names.some((spelling) => spelling.every((s) => error.includes(s)))]).toEqual([error, true]);
      }
      if (c.code === 'NO_RESEARCHER' || c.beforeAnyQuery === true) {
        // THE ORDER: decided before any query — nothing asked, no delegate called.
        expect(asked).toEqual([]);
        expect(delegatesCalled()).toEqual([]);
      }
    });
  }
}

/**
 * The tool's code-set equality, over produced ∪ owed. DEFINED LAST in its describe:
 * jest runs a file's cases in the order they are declared, nested describes included,
 * so every case that produces a code has run before this reads the set. A run
 * filtered with `-t` produces fewer codes and reddens this, as it should.
 */
export function codeSetEquality(tool: ToolName): void {
  it(`${tool} — the codes its cases produced, with the owed, are contract.ts's set exactly`, async () => {
    await handlerOf(tool);
    const { codes, owed } = TOOLS[tool];
    const owedCodes = owed.map((o) => o.code);
    const got = [...new Set([...(produced.get(tool) ?? []), ...owedCodes])].sort();
    expect(got).toEqual([...new Set([...codes, ...owedCodes])].sort());
  });
}

// --- answers -------------------------------------------------------------------

/** An ANSWER — a JSON object that is not a refusal. */
export function answerOf(out: string): Record<string, unknown> {
  const body: unknown = JSON.parse(out);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error(`not a JSON object: ${out}`);
  if ('code' in body) throw new Error(`a REFUSAL where an answer was owed: ${out}`);
  return body as Record<string, unknown>;
}

/** An answer that is a LIST. */
export function listOf(out: string): unknown[] {
  const body: unknown = JSON.parse(out);
  if (!Array.isArray(body)) throw new Error(`not a JSON list: ${out}`);
  return body;
}

/** Does `needle` appear, deep-equal, anywhere inside `haystack` — so a case can hold a VALUE without fixing a shape. */
export function containsDeep(haystack: unknown, needle: unknown): boolean {
  if (isDeepStrictEqual(haystack, needle)) return true;
  if (Array.isArray(haystack)) return haystack.some((h) => containsDeep(h, needle));
  if (typeof haystack === 'object' && haystack !== null) return Object.values(haystack).some((h) => containsDeep(h, needle));
  return false;
}

/** Every object anywhere inside `haystack` that `test` accepts — to find an entry by a field A4 names. */
export function objectsWhere(haystack: unknown, test: (o: Record<string, unknown>) => boolean): Record<string, unknown>[] {
  if (Array.isArray(haystack)) return haystack.flatMap((h) => objectsWhere(h, test));
  if (typeof haystack !== 'object' || haystack === null) return [];
  const object = haystack as Record<string, unknown>;
  return [...(test(object) ? [object] : []), ...Object.values(object).flatMap((v) => objectsWhere(v, test))];
}

// --- the world -----------------------------------------------------------------

export const MISSING_THESIS = 'thesis-that-does-not-exist';
export const MISSING_FRAMING = 'framing-that-does-not-exist';
/** Cuid-shaped, as `#tr_<cuid>` requires (A1 :1244), and no ClaimTrajectory has it. */
export const UNKNOWN_TRAJECTORY = 'clx9trajectory00000000999';
/** A WELL-FORMED record name the corpus does not hold — `#ev_` followed by it parses and resolves to nothing. */
export const NAMELESS_RECORD = `0x${'00'.repeat(32)}`;
/** A version a human stood behind BEFORE the pair's content moved to CURRENT_VERSION. */
export const AFFIRMED_BEFORE = 'content-affirmed';

/** A version text citing the given tokens — the version write's input, as T2 shapes it. */
export const textCiting = (...tokens: readonly string[]): string => `כפי שהעמוד הראה ${tokens.join(' ')}\n`;

/**
 * The ClaimTrajectory the fixtures cite, as a WHOLE row — every column the citation
 * resolver selects (`services/trajectoryCitation.ts` :283–:300), so a builder that
 * resolves the token through the one resolver reads a row it can render.
 */
const TRAJECTORY_ROW: Row = {
  id: TRAJECTORY_ID,
  claimHash: 'claim-hash-of-the-trajectory',
  claimText: 'הקישור לדיווח על תופעות לוואי',
  observations: '[]',
  transitions: 2,
  firstSeen: '2020-12-09',
  lastSeen: '2021-06-12',
  finalState: 'REMOVED',
  patternHash: 'pattern-1',
  computationId: 'computation-1',
  trackedUrlId: PAGE.id,
  trackedUrl: { url: URL },
  computation: {
    id: 'computation-1',
    sourceStateHash: 'state-1',
    detectionVersion: 'v3',
    computedAt: new Date('2026-09-01T00:00:00.000Z'),
    snapshotsExamined: 9,
  },
};

/**
 * The corpus beneath the fixture VERSION's citation: the page, its two captures, the
 * pair and its CURRENT content version, the work-list row of the later capture, and
 * the one ClaimTrajectory the fixtures cite. `acquired: false` leaves the later capture
 * fetched but SKIPPED — no snapshot and so no pair, its bytes' hash on the work-list
 * row; `derived: false` leaves the pair with no content version (AWAITING_DERIVATION).
 */
export function seedCorpus(over: { acquired?: boolean; derived?: boolean } = {}): void {
  const acquired = over.acquired ?? true;
  const derived = over.derived ?? true;
  const held = (capture: typeof BEFORE): Row => ({ ...capture, trackedUrlId: PAGE.id, trackedUrl: PAGE });
  store.captures = acquired ? [held(BEFORE), held(AFTER)] : [held(BEFORE)];
  store.diffs = acquired ? [{ ...DIFF_ROW, trackedUrlId: PAGE.id, contentVersions: derived ? [CURRENT_VERSION] : [] }] : [];
  store.contentVersions = acquired && derived ? [{ ...CURRENT_VERSION, diffId: DIFF_ROW.id }] : [];
  // Every key is a column of `CdxIndexEntry` (prisma/schema.prisma), `status` among
  // them — the one `lookupCapture` selects (7.3 round 2, L2). The double answers
  // this row only to a `where` naming ITS page and timestamp (M1).
  store.workList = {
    trackedUrlId: PAGE.id,
    waybackTimestamp: AFTER.waybackTimestamp,
    status: acquired ? 'ACQUIRED' : 'SKIPPED',
    rawBytesHash: AFTER.documentHash,
    snapshotId: acquired ? AFTER.id : null,
    reason: acquired ? null : 'a paywall page, not the article',
  };
  store.trajectories = [TRAJECTORY_ROW];
}

/** When AS_PUBLISHED published — after every fixture row's instant. */
export const PUBLISHED_AT = new Date(Date.UTC(2026, 8, 10, 9, 30));

/** Published: the head IS the published version — what NOTHING_NEW and PUBLISHED refuse on. */
export const AS_PUBLISHED: Partial<ThesisRow> = {
  publishedVersionId: VERSION.id,
  publishedAt: PUBLISHED_AT,
  publishedById: THESIS.createdById,
};

/**
 * THESIS as `over` shapes it, its head VERSION with its one citation, its framing and
 * the framing's rounds, over the corpus. No evidence row: nobody has promoted the
 * record, so the pin a write computes is CURRENT's (T2 :412).
 */
export function seedThesis(over: Partial<ThesisRow> = {}): ThesisRow {
  seedCorpus();
  const thesis: ThesisRow = { ...THESIS, ...over };
  store.thesis = thesis;
  store.theses = [thesis];
  store.versions = thesis.headVersionId === null ? [] : [VERSION];
  store.mentions = thesis.headVersionId === null ? [] : [mentionRow(MENTION, thesis.publishedVersionId === VERSION.id)];
  store.framings = [FRAMING];
  store.framingRounds = [...ROUNDS];
  return thesis;
}

/** The cited record PROMOTED, a human having stood behind `affirmed`. */
export function seedEvidence(affirmed: string): void {
  store.evidenceRows = [
    { fileHash: DIFF_NAME, kind: 'DIFF', status: 'PROMOTED', affirmedContentVersionHash: affirmed, snapshot: null, urlVersionDiff: DIFF_ROW },
  ];
}

/**
 * Q1's RACE, staged on the one field the ruling names (memory/gf-step-17-rulings):
 * the write reads `affirmed`, and in that instant a REAFFIRM commits elsewhere — the
 * FIRST read of the record's `affirmedContentVersionHash` sees `from`, and every
 * read after it sees `to`. A write that reads once and writes whatever it read pins
 * `from` silently; a write that holds the pin to `affirmed` at its commit, as Q1
 * rules, sees `to` and refuses STALE_PIN. The NEXT write reads `to` and re-pins.
 *
 * WHAT THE STAGING BINDS: the write re-reads `affirmed` inside its transaction before
 * it commits — Q1's "a REAFFIRM committing between that read and the commit refuses".
 * A write that instead LOCKED the row for the transaction's length would make this
 * interleaving unreachable; the step that builds it states which it is.
 */
export function reaffirmDuringTheWrite(from: string, to: string): void {
  let reaffirmed = false;
  const row: Row = { fileHash: DIFF_NAME, kind: 'DIFF', status: 'PROMOTED', snapshot: null, urlVersionDiff: DIFF_ROW };
  Object.defineProperty(row, 'affirmedContentVersionHash', {
    enumerable: true,
    get(): string {
      if (reaffirmed) return to;
      reaffirmed = true;
      return from;
    },
  });
  store.evidenceRows = [row];
}

// --- one well-formed call per write on a thesis ---------------------------------

/**
 * ONE CALL PER WRITE ON A THESIS, on the fixture thesis or its framing — the input a
 * tool file's cases start from, and the one `authorship.test.ts` makes as a stranger,
 * as no one, and against an id naming nothing. One spelling, so the property and the
 * per-tool cases cannot drift onto different calls. Each is WELL-FORMED — every
 * argument present and valid on `seedThesis`'s world — so a stranger's refusal cannot
 * be an argument's in disguise. Keyed by the contract's tuple, so the compiler holds
 * one entry per tool. Records are named as evidence A1 says, by page and timestamps
 * (evidence A4 :1069; `{ url, capture }` :1112 and `{ url, before, after }` :1097).
 */
export const ON_THE_FIXTURE: Readonly<Record<WriteToolOnAThesis, Readonly<Record<string, unknown>>>> = {
  open_framing: { question: FRAMING.question, provision: PROVISION, thesisId: THESIS.id },
  assess_framing: {
    framingId: FRAMING.id,
    proposedFraming: CLAIM,
    elements: [],
    records: [{ url: URL, before: BEFORE.waybackTimestamp, after: AFTER.waybackTimestamp }],
    trajectoryIds: [TRAJECTORY_ID],
  },
  choose_framing: { framingId: FRAMING.id, claim: CLAIM, provision: PROVISION, elements: [] },
  add_thesis_version: { thesisId: THESIS.id, text: VERSION_TEXT, claim: CLAIM, expectedHeadVersionId: VERSION.id },
  run_analysis: { thesisId: THESIS.id },
  decide_gap: {
    thesisId: THESIS.id,
    gapId: OPEN_GAP.gapId,
    decision: 'DISMISSED',
    reason: 'לא רלוונטי',
    expectedSequence: OPEN_GAP.sequence,
  },
  draft_foia_request: { thesisId: THESIS.id, gapId: OPEN_GAP.gapId },
  publish_thesis: { thesisId: THESIS.id, rationale: 'הטיעון לפרסום הגרסה הזו', publicInterestStatement: 'עניין ציבורי מובהק' },
  unpublish_thesis: { thesisId: THESIS.id, reason: 'נמצאה טעות בציטוט' },
  add_note: { thesisId: THESIS.id, text: NOTE.text },
};
