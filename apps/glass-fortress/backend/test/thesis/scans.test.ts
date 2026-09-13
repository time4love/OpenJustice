jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));

import { join } from 'node:path';
import { DIFF_NAME } from '../helpers/corpusFixture';
import { SRC, codeOf, readCode } from '../walk/scan';
import { built } from './absent';
import { MODEL_ACTORS, MODULES, type ThesisIdentityModule, type ThesisPredicatesModule } from './contract';
import { OPEN_GAP, OPEN_GAP_DESCRIPTION_SPACED, THESIS, TRAJECTORY_ID } from './fixtures';
import { gap } from './gateWorld';
import { SCHEMA, blockNamed, blocksOf, fieldsOf, modules, sourceOf } from './scanning';

// ---------------------------------------------------------------------------
// A7's SCANS FOR THE THESIS LAYER — docs/gf-thesis-flows.md A7 (:1630–:1660), the
// R40 sketch §5a–§5d, §5f and §5g (7.5a). Each A7 name is a `describe` under its
// EXACT title, so §5h's meta-case can find it.
//
// EVERY SCAN CARRIES A DECOY IT MUST CATCH AND A SNIPPET IT MUST NOT, built on
// `test/walk/scan.ts`'s `readCode` / `codeOf`, which strip comments: a rule a
// paragraph mentioning it satisfies is not a rule, and a scan that matches nothing is
// the vacuity this repository has paid for.
//
// THREE KINDS OF CASE, AND THE REPORT COUNTS THEM APART:
//   - a module a later step builds, read through `sourceOf` — red BY NAME, "X is not
//     built — thesis step N builds it", as the loader's are;
//   - a rule the PRESENT tree breaks — red on its offenders, the owner step in the
//     case's title (`(thesis step 18)`): the second spellings of NORMALISE, the retired
//     schema and source words, the session tables;
//   - a half the tree already holds, and every decoy case — GREEN, declared ground.
// ---------------------------------------------------------------------------

// `modules`, `sourceOf` and the schema reader are `test/thesis/scanning.ts`'s — moved
// there at 7.5b, verbatim, when `invariants.test.ts` needed the same.

// ---------------------------------------------------------------------------
// thesis-no-log — A7 :1630–:1632, §9 :981–:984 · sketch §5a
// ---------------------------------------------------------------------------

describe('thesis-no-log', () => {
  const THESIS_MODELS = ['Thesis', 'ThesisVersion', 'Framing', 'ThesisGapDecision'];
  const THESIS_KEYS = ['thesisId', 'versionId', 'framingId', 'gapId'];
  /**
   * THE DEBATE'S TWO TABLES, one entry each (sketch §0c). The flows keep the debate
   * "as built — a session with a goal, a lifecycle and an event log" (evidence §4
   * :334–:336; thesis §12 :1145), and each appendix says the flows win. Evidence
   * A2's `DebateSession` and its events, both renamed at thesis step 18.
   */
  const DEBATE_TABLES = ['DebateSession', 'DebateEvent'];

  /**
   * Every model named `*Session` or `*Event` that references a thesis, a version, a
   * framing or a gap — by a relation to one of them, by one of their key columns, or
   * by a relation to ANOTHER such model (a log's events are a log). Fixed point, so
   * the chain's length does not matter.
   */
  function logModels(schema: string, allowed: readonly string[]): string[] {
    const logs = blocksOf(schema).filter(
      (b) => b.kind === 'model' && /(?:Session|Event)$/.test(b.name) && !allowed.includes(b.name),
    );
    const firing = new Set<string>();
    let grew = true;
    while (grew) {
      grew = false;
      for (const log of logs) {
        if (firing.has(log.name)) continue;
        const hit = fieldsOf(log).some(
          (f) => THESIS_KEYS.includes(f.name) || THESIS_MODELS.includes(f.type) || firing.has(f.type),
        );
        if (hit) {
          firing.add(log.name);
          grew = true;
        }
      }
    }
    return [...firing].sort();
  }

  /** A write to a `*Session` or `*Event` delegate — the debate's are the evidence scan's to pin. */
  const LOG_WRITE = /\.([a-z]\w*(?:Session|Event))\.(?:create|createMany|update|updateMany|upsert)\s*\(/g;
  const DEBATE_DELEGATES = ['debateSession', 'debateEvent'];
  const logWrites = (code: string): string[] =>
    [...code.matchAll(LOG_WRITE)].map((m) => m[1] ?? '').filter((d) => !DEBATE_DELEGATES.includes(d));

  it("no *Session or *Event model references a thesis, version, framing or gap — the debate's two tables excepted — RED until step 18 drops ResearchSession and its events (thesis step 18)", () => {
    expect(logModels(SCHEMA, DEBATE_TABLES)).toEqual([]);
  });

  it("the debate's two entries are PINNED: each a model of the schema that WOULD fire without its entry", () => {
    expect(DEBATE_TABLES.filter((name) => blockNamed('model', name) === undefined)).toEqual([]);
    expect(logModels(SCHEMA, []).filter((name) => DEBATE_TABLES.includes(name))).toEqual([...DEBATE_TABLES].sort());
  });

  it("no module under src/ writes a *Session or *Event delegate but the debate's — whose three writers `test/evidence/scans.test.ts` pins, referenced and not re-listed", () => {
    const offenders = modules().flatMap(({ file, code }) => logWrites(code).map((d) => `${file} writes ${d}`));
    expect(offenders).toEqual([]);
  });

  it('DETECTS a log model and a log write — and an allow-listed debate, an OAuth session and a comment do not fire', () => {
    expect(logModels('model FramingEvent {\n  id String\n  framingId String\n}\n', [])).toEqual(['FramingEvent']);
    // A LOG OF A LOG: the events of a session that names a thesis fire through it.
    expect(logModels('model NoteSession {\n  thesis Thesis\n}\nmodel NoteEvent {\n  session NoteSession\n}\n', [])).toEqual([
      'NoteEvent',
      'NoteSession',
    ]);
    expect(logModels('model DebateSession {\n  id String\n  thesisId String\n}\n', DEBATE_TABLES)).toEqual([]);
    expect(logModels('model Session {\n  id String\n  sid String\n  data String\n}\n', [])).toEqual([]);
    expect(logModels('model AuditEvent {\n  id String // the thesisId lives elsewhere\n}\n', [])).toEqual([]);
    expect(logWrites('await tx.researchSessionEvent.create({ data });')).toEqual(['researchSessionEvent']);
    expect(logWrites('await prisma.debateEvent.create({ data });')).toEqual([]);
    expect(logWrites('await prisma.researchSession.findMany({});')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// versions-immutable — A7 :1634–:1637 · sketch §5b
// ---------------------------------------------------------------------------

describe('versions-immutable', () => {
  const EDIT = /\.thesisVersion\.(?:update|updateMany|upsert)\s*\(/;
  const CREATE = /\.thesisVersion\.(?:create|createMany)\s*\(/;
  const WRITER = 'services/thesisVersionWrite.ts';

  it('`thesisVersion.update`, `updateMany` and `upsert` have NO caller under src/ — a version is never edited', () => {
    expect(modules().filter(({ code }) => EDIT.test(code)).map((m) => m.file)).toEqual([]);
  });

  it('`thesisVersion.create` is called from EXACTLY ONE module, services/thesisVersionWrite.ts (thesis step 20)', () => {
    sourceOf(WRITER, MODULES['services/thesisVersionWrite'].step);
    expect(modules().filter(({ code }) => CREATE.test(code)).map((m) => m.file)).toEqual([WRITER]);
  });

  // A7's third clause — "the test that writes twice against one head watches the
  // second refuse STALE_HEAD" — is `versionWrite.test.ts`'s case, named and not re-written.

  it('DETECTS an edit and a create in the tx. and prisma. shapes, and does not fire on a read', () => {
    expect(EDIT.test('await tx.thesisVersion.update({ where, data });')).toBe(true);
    expect(EDIT.test('await prisma.thesisVersion.upsert({ where, create, update });')).toBe(true);
    expect(CREATE.test('await tx.thesisVersion.create({ data });')).toBe(true);
    expect(EDIT.test('await prisma.thesisVersion.findUnique({ where: { id } });')).toBe(false);
    expect(CREATE.test('await prisma.thesisVersion.findUnique({ where: { id } });')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// models-write-no-state — A7 :1639–:1642 · sketch §5c
// ---------------------------------------------------------------------------

describe('models-write-no-state', () => {
  /** A VALUE import of the client — `import type` is allowed; `import { type X }` is not told apart, and fires. */
  const VALUE_IMPORT = /^\s*import\s+(?!type\s)[^;]*?\bfrom\s+'(?:[^']*\/lib\/prisma|@prisma\/client)'/m;
  const REQUIRE = /\brequire\(\s*'(?:[^']*\/lib\/prisma|@prisma\/client)'\s*\)/;
  const reachesTheClient = (code: string): boolean => VALUE_IMPORT.test(code) || REQUIRE.test(code);

  // ONE CASE PER ACTOR, so each reddens by name. The Prosecutor has no subject until
  // its own build (thesis §10); the Gate 5 classifier `services/ForensicAgent.ts` is
  // the walk's model and outside this list, named so its absence is not an omission.
  for (const [actor, step] of Object.entries(MODEL_ACTORS)) {
    it(`${actor} imports no database client — its output reaches a row only through the tool that called it, after the audit`, () => {
      expect(reachesTheClient(sourceOf(actor, step))).toBe(false);
    });
  }

  it('DETECTS a value import and a require — and an `import type` does not fire', () => {
    expect(reachesTheClient("import { prisma } from '../lib/prisma';")).toBe(true);
    expect(reachesTheClient("import {\n  PrismaClient,\n} from '@prisma/client';")).toBe(true);
    expect(reachesTheClient("const { prisma } = require('../lib/prisma');")).toBe(true);
    expect(reachesTheClient("import type { Prisma } from '@prisma/client';")).toBe(false);
    expect(reachesTheClient("import { LLMFactory } from '../factories/LLMFactory';")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// one-symbol — A7 :1644–:1647 · sketch §5d (and §0a)
// ---------------------------------------------------------------------------

describe('one-symbol', () => {
  const PREDICATES = 'services/thesisPredicates.ts';

  interface OneSymbol {
    name: string;
    module: string;
    kind: 'function' | 'table';
    step: number;
  }

  /**
   * THE SIX, each with its module and the step that owes it — read from
   * `contract.ts`'s MODULES where the module is the thesis layer's, never re-listed.
   * NORMALISE lives in `lib/normalise.ts`, a module that imports nothing (thesis A1
   * :1247–:1250, as amended at step 18); `test/thesisGuards.test.ts` holds that it
   * imports nothing, in the run that gates.
   */
  const SYMBOLS: readonly OneSymbol[] = [
    { name: 'normaliseClaim', module: 'lib/normalise.ts', kind: 'function', step: MODULES['lib/normalise'].exports.normaliseClaim.step },
    { name: 'PROVISIONS', module: 'lib/provisions.ts', kind: 'table', step: MODULES['lib/provisions'].exports.PROVISIONS.step },
    ...(['claimFramed', 'fingerprint', 'gapInForce', 'publishableVersion'] as const).map(
      (name): OneSymbol => ({
        name,
        module: PREDICATES,
        kind: 'function',
        step: MODULES['services/thesisPredicates'].exports[name].step,
      }),
    ),
  ];

  const functionDeclaration = (name: string): RegExp => new RegExp(`function\\s+${name}\\s*[<(]`);
  const constDeclaration = (name: string): RegExp => new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*[:=]`);
  const declares = (code: string, name: string): boolean =>
    functionDeclaration(name).test(code) || constDeclaration(name).test(code);

  for (const symbol of SYMBOLS) {
    it(`${symbol.name} is DECLARED in ${symbol.module} — its one importable symbol`, () => {
      expect(declares(sourceOf(symbol.module, symbol.step), symbol.name)).toBe(true);
    });
  }

  it('no module but its own declares a FUNCTION of any of them — `const` is not scanned globally, a local `const fingerprint = …` being legitimate', () => {
    const offenders = modules().flatMap(({ file, code }) =>
      SYMBOLS.filter((s) => s.kind === 'function' && s.module !== file && functionDeclaration(s.name).test(code)).map(
        (s) => `${file} declares ${s.name}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  // NORMALISE'S SECOND SPELLINGS — the three shapes the collapse is written in.
  const SECOND_SPELLINGS = [
    /\.replace\(\s*\/\\s\+\/g[a-z]*\s*,\s*(['"]) \1\s*\)/,
    /\.replaceAll\(\s*\/\\s\+\/g\s*,\s*(['"]) \1\s*\)/,
    /\.split\(\s*\/\\s\+\/\s*\)\s*\.join\(\s*(['"]) \1\s*\)/,
  ];
  const spells = (code: string): boolean => SECOND_SPELLINGS.some((re) => re.test(code));
  const NORMALISE_MODULE = 'lib/normalise.ts';

  /**
   * NOT NORMALISE, each for sketch §0a's reason: the collapsed text feeds no fact
   * reported about a CLAIM's text, and binding it to the thesis layer's symbol would
   * let a thesis change move a rule of the corpus.
   *
   * THE LAST TWO ARE NOT IN §5d's THREE — ADDED AT 7.5a, for REVIEW's ruling. §5d's
   * pattern admits flags (`g[a-z]*`) and these two spell `/gu`, which §0a's count of
   * `/g, ' '` never read. Classified by §0a's own test, they are the corpus's, as
   * `claimSurvival` is.
   */
  const NOT_NORMALISE: Readonly<Record<string, string>> = {
    'lib/claimSurvival.ts': "interaction A4's SEGMENT rule — a line, for Gate 1's and SEEN's set identity; the walk's own",
    'lib/extractionDrift.ts': "the segment rule's attribution inside the walk's Gate 1",
    'lib/chromeRulesetApply.ts': "a preview label on the marking page's outline — display, no comparison",
    'lib/chunkRewriteLoss.ts': "the re-diff guard: a stored chunk's sentences against the corpus's own texts (a corpus rule)",
    'lib/diffCoverage.ts': "the classifier's coverage: a chunk against the classifier's quotes (a corpus measurement)",
  };

  it('NORMALISE is spelled in no module but lib/normalise.ts — RED at lib/htmlText.ts and services/thesisClaimAudit.ts until step 18 makes each a call (thesis step 18)', () => {
    const offenders = modules()
      .filter(({ file }) => file !== NORMALISE_MODULE && !(file in NOT_NORMALISE))
      .filter(({ code }) => spells(code))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('the allow-list is PINNED — each entry a module of the tree that still spells it, and the one symbol spells it too', () => {
    const held = new Map(modules().map(({ file, code }) => [file, code]));
    const stale = Object.keys(NOT_NORMALISE).filter((file) => !spells(held.get(file) ?? ''));
    expect(stale).toEqual([]);
    expect(spells(held.get(NORMALISE_MODULE) ?? '')).toBe(true);
  });

  // THE THESIS GATE'S OWN RULE — evidence §5b's shape over `services/thesisGate.ts`:
  // it MAPS and does not LOAD. It imports no client, names no delegate, declares no
  // predicate of EITHER names list under either spelling, and CALLS publishableVersion.
  const GATE = 'services/thesisGate.ts';
  const GATE_STEP = MODULES['services/thesisGate'].step;
  const PRISMA_IMPORT = /from '(?:[^']*\/lib\/prisma|@prisma\/client)'/;
  const DELEGATE =
    /\.(?:thesis|thesisVersion|thesisMention|framing|framingRound|thesisAnalysis|thesisGapDecision|publicationAttempt|withdrawal|note|evidence|evidenceDecision|urlVersionDiff|diffContentVersion|integrityCheck|claimTrajectory|debateSession)\./;
  /**
   * EITHER NAMES LIST: every function `services/evidencePredicates.ts` exports — READ
   * from the module, never re-listed, so the evidence suite's list and this one cannot
   * drift — and the thesis layer's six.
   */
  const EVIDENCE_EXPORTS = [
    ...readCode(join(SRC, 'services/evidencePredicates.ts')).matchAll(/^export\s+(?:async\s+)?function\s+(\w+)/gm),
  ].map((m) => m[1] ?? '');
  const FORBIDDEN = [...EVIDENCE_EXPORTS, ...SYMBOLS.map((s) => s.name)].flatMap((name) => [
    functionDeclaration(name),
    constDeclaration(name),
  ]);
  const CALLS_THE_PREDICATE = /\bpublishableVersion\s*\(/;

  it('the gate imports no Prisma client and no lib/prisma (thesis step 23)', () => {
    expect(PRISMA_IMPORT.test(sourceOf(GATE, GATE_STEP))).toBe(false);
  });

  it('the gate names no Prisma delegate (thesis step 23)', () => {
    expect(DELEGATE.test(sourceOf(GATE, GATE_STEP))).toBe(false);
  });

  it('the gate declares no predicate of either names list, as a function or a const (thesis step 23)', () => {
    const code = sourceOf(GATE, GATE_STEP);
    expect(FORBIDDEN.filter((re) => re.test(code)).map(String)).toEqual([]);
  });

  it('the gate CALLS publishableVersion — the rule has a subject (thesis step 23)', () => {
    expect(CALLS_THE_PREDICATE.test(sourceOf(GATE, GATE_STEP))).toBe(true);
  });

  it("DETECTS each shape — a symbol planted plain and generic, each NORMALISE spelling, the gate's forbidden shapes — and a call, a bare trim and a collapse to nothing do not fire", () => {
    for (const symbol of SYMBOLS.filter((s) => s.kind === 'function')) {
      expect(functionDeclaration(symbol.name).test(`export function ${symbol.name}(input: unknown) { return input; }`)).toBe(true);
      expect(functionDeclaration(symbol.name).test(`export function ${symbol.name}<V>(input: V) { return input; }`)).toBe(true);
      expect(functionDeclaration(symbol.name).test(`const answer = ${symbol.name}(input);`)).toBe(false);
    }
    expect(declares('export const PROVISIONS = { NUREMBERG_1: {} };', 'PROVISIONS')).toBe(true);
    for (const spelling of [
      "text.replace(/\\s+/g, ' ')",
      "text.replace(/\\s+/gu, ' ').trim()",
      "text.replaceAll(/\\s+/g, ' ')",
      "text.split(/\\s+/).join(' ')",
    ]) {
      expect(spells(spelling)).toBe(true);
    }
    expect(spells('text.trim()')).toBe(false);
    expect(spells("text.replace(/\\s+/g, '')")).toBe(false);
    // A paragraph naming the spelling is not the spelling: `codeOf` strips it.
    expect(spells(codeOf("// a second replace(/\\s+/g, ' ') is the copy that drifts\nconst x = 1;"))).toBe(false);
    // The gate's shapes, and its non-firing controls: calls to imported predicates.
    expect(EVIDENCE_EXPORTS).toEqual(expect.arrayContaining(['publishableEvidence', 'argued', 'verified']));
    expect(PRISMA_IMPORT.test("import { prisma } from '../lib/prisma';")).toBe(true);
    expect(DELEGATE.test('await prisma.thesisGapDecision.findMany({ where });')).toBe(true);
    expect(FORBIDDEN.some((re) => re.test('const fingerprint = computeIt(v);'))).toBe(true);
    expect(FORBIDDEN.some((re) => re.test('export function argued(m: Row) { return true; }'))).toBe(true);
    expect(CALLS_THE_PREDICATE.test('const report = await publishableVersion(versionId, assessment);')).toBe(true);
    for (const call of ['const rows = await evidenceChecks(versionId);', 'const ok = claimFramed(input);']) {
      expect(PRISMA_IMPORT.test(call) || DELEGATE.test(call) || FORBIDDEN.some((re) => re.test(call))).toBe(false);
    }
    expect(CALLS_THE_PREDICATE.test('type R = ReturnType<typeof publishableVersion>;')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// gap-id-stable — A7 :1652–:1653 · A1 :1231–:1235 · sketch §5f
// ---------------------------------------------------------------------------

describe('gap-id-stable', () => {
  // THE VECTORS ARE THE SKETCH'S, derived OUTSIDE the implementation at a shell with
  // Python's hashlib (§5f), and re-derived since: gapId(a) = gapId(b) = gapId(c) by
  // REVIEW with perl (7.3); the contentHash pair at 7.5a with shasum, openssl and
  // Python. `a` is OPEN_GAP_DESCRIPTION_SPACED and `b` OPEN_GAP.description.
  const REWORDED = 'מסמך הצגת הנתונים למשרד הבריאות לפני 6 באוגוסט 2022';
  const REWORDED_ID = '0x925e813b18233dc71792ff6d237b1a4032eda5d1bd5625ce0b938f7fda2c8626';
  const CITING = `כפי שאמר העמוד ב-5 באוגוסט 2022 #ev_0x${'ab'.repeat(32)}`;
  const WITH_NEWLINE = '0xc9b048e2ae99fe99492b8dbadd8a7925b40409327d52ff35565de0b8f3351818';
  const WITHOUT_NEWLINE = '0xf63b5f918b045f2eaa10af99bfffbcfd08a27cfd4e0a46c9bbdb8e3c2ecf3dea';

  const identity = (...names: (keyof ThesisIdentityModule)[]): Promise<ThesisIdentityModule> =>
    built<ThesisIdentityModule>('lib/thesisIdentity', names);

  it('the same description with different whitespace is ONE gapId — the shell vector (thesis step 22)', async () => {
    const { gapId } = await identity('gapId');
    expect([gapId(OPEN_GAP_DESCRIPTION_SPACED), gapId(OPEN_GAP.description)]).toEqual([OPEN_GAP.gapId, OPEN_GAP.gapId]);
  });

  it('a RE-WORDED description is another gap — its own shell vector (thesis step 22)', async () => {
    const { gapId } = await identity('gapId');
    expect(gapId(REWORDED)).toBe(REWORDED_ID);
  });

  it('decisions CARRY — a decision made while version 1 was HEAD is in force on version 2, the gap still on the list (thesis step 22)', async () => {
    const { gapId } = await identity('gapId');
    const p = await built<ThesisPredicatesModule>('services/thesisPredicates', ['gapList']);
    const decided = gap(1, 'DISMISSED', { reason: 'לא רלוונטי', gapId: gapId(OPEN_GAP_DESCRIPTION_SPACED) });
    // VERSION's head cites the diff; TRAJECTORY_VERSION's the trajectory.
    const onEach = [[DIFF_NAME], [TRAJECTORY_ID]].map((headNames) =>
      p.gapList([decided], THESIS.id, headNames).map((e) => [e.gapId, e.readsAs]),
    );
    expect(onEach).toEqual([[[OPEN_GAP.gapId, 'DISMISSED']], [[OPEN_GAP.gapId, 'DISMISSED']]]);
  });

  it('contentHash is over the BYTES exactly — a trailing newline is a different version (thesis step 20)', async () => {
    const { contentHash } = await identity('contentHash');
    expect([contentHash(`${CITING}\n`), contentHash(CITING)]).toEqual([WITH_NEWLINE, WITHOUT_NEWLINE]);
  });
});
