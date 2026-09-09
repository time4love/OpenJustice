import { relative } from 'node:path';
import { SRC, tsFiles, readCode } from '../walk/scan';

// ---------------------------------------------------------------------------
// A7's ACCEPTANCE SCANS — the rules a behaviour test cannot hold.
//
// Each is a property over every file, including the one added tomorrow that
// nobody wrote a case for, and each carries a DECOY: a snippet the scan must
// match, so a scan that matches nothing is caught as the vacuity this repository
// has paid for. `readCode` strips comments, so a rule satisfied by a paragraph
// mentioning it is not satisfied.
//
// SEVERAL HOLD ZERO TODAY, AND THAT IS NOT THE SAME AS HOLDING NOTHING. "The
// walk writes no evidence" is true now because no evidence writer exists at all;
// the scan is what keeps it true on the day step 13 writes the first one in the
// wrong place. The decoy is what separates a rule that is satisfied from one
// that is merely unexercised.
// ---------------------------------------------------------------------------

const modules = () =>
  tsFiles(SRC).map((file) => ({ file: relative(SRC, file), code: readCode(file) }));

const EVIDENCE_TABLES = ['evidence', 'evidenceDecision', 'thesisMention'] as const;

/** A Prisma write to one of the evidence tables, by table and verb. */
const writeTo = (table: string): RegExp =>
  new RegExp(`\\.${table}\\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\\s*\\(`);

/** A Prisma removal on one of them — the verbs the design has no use for. */
const removeFrom = (table: string): RegExp =>
  new RegExp(`\\.${table}\\.(?:delete|deleteMany)\\s*\\(`);

describe('the walk writes the CORPUS and never an evidence row', () => {
  // The two authorities of the design, as a build-time rule: acquisition never
  // judges research. A pointer the walk moved would be the walk writing evidence,
  // which is why CURRENT is derived and `affirmed` is the only stored human fact.
  it('no module under src/walk writes Evidence, EvidenceDecision or ThesisMention', () => {
    const offenders = modules()
      .filter(({ file }) => file.startsWith('walk/'))
      .map(({ file, code }) => ({ file, tables: EVIDENCE_TABLES.filter((t) => writeTo(t).test(code)) }))
      .filter((m) => m.tables.length > 0);
    expect(offenders).toEqual([]);
  });

  it('finds the walk at all — a silent zero would make this vacuous', () => {
    expect(modules().filter(({ file }) => file.startsWith('walk/')).length).toBeGreaterThanOrEqual(5);
  });

  it('DETECTS a planted write — the scan can see what it forbids', () => {
    expect(writeTo('evidence').test('await tx.evidence.create({ data });')).toBe(true);
    expect(writeTo('evidenceDecision').test('prisma.evidenceDecision.createMany({ data })')).toBe(true);
    expect(writeTo('evidence').test('const rows = await prisma.evidence.findMany({});')).toBe(false);
  });
});

describe('the three evidence tables have no writer outside the three sites A7 names', () => {
  // `promote_from_debate`, `review_evidence` and the thesis version write. NONE
  // of the three exists yet — steps 13, 14 and thesis 20 build them — so this
  // holds ZERO writers today. It is written now because the moment that stops
  // being true is the moment it has something to say, and a rule added after the
  // first writer is a rule shaped to permit it.
  const ALLOWED = [
    'services/promoteFromDebate.ts',
    'services/reviewEvidence.ts',
    'services/thesisVersionWrite.ts',
  ];

  it('no module outside the three writes one', () => {
    const offenders = modules()
      .filter(({ file }) => !ALLOWED.includes(file))
      .map(({ file, code }) => ({ file, tables: EVIDENCE_TABLES.filter((t) => writeTo(t).test(code)) }))
      .filter((m) => m.tables.length > 0);
    expect(offenders).toEqual([]);
  });
});

describe('no research act reaches the chain', () => {
  // Target §9.8: "the registry's `submit` has ONE caller, the anchoring module".
  // The false-CONFIRMED class had a laptop mixing one environment's database with
  // another's registry; with the walk the only writer, running inside the
  // deployment, it has no research-act path left to travel.
  const REGISTER = /\.registerEvidenceHash\s*\(/;

  it('registerEvidenceHash has exactly one caller, and it is the anchoring module', () => {
    const callers = modules()
      .filter(({ code }) => REGISTER.test(code))
      .map(({ file }) => file)
      .filter((f) => f !== 'services/Web3Service.ts');
    expect(callers).toEqual(['services/anchorSnapshots.ts']);
  });

  it('DETECTS a second caller — proven against the shape it forbids', () => {
    expect(REGISTER.test('await registrar.registerEvidenceHash(hash, category);')).toBe(true);
  });
});

describe('nothing is removed from the evidence tables', () => {
  // "Nothing is deleted, ever, after the rebuild. Rows are appended, statuses
  // move forward, versions accumulate." A withdrawn record keeps its name, its
  // argument and its citations, so a reader of the thesis that cited it can find
  // out what happened — which is the whole reason withdrawal is not removal.
  it('no removal verb on Evidence, EvidenceDecision or ThesisMention', () => {
    const offenders = modules()
      .map(({ file, code }) => ({ file, tables: EVIDENCE_TABLES.filter((t) => removeFrom(t).test(code)) }))
      .filter((m) => m.tables.length > 0);
    expect(offenders).toEqual([]);
  });

  it('DETECTS a planted removal, and does not fire on an update', () => {
    expect(removeFrom('evidence').test('await prisma.evidence.delete({ where: { id } });')).toBe(true);
    expect(removeFrom('evidence').test('await prisma.evidence.update({ where: { id } });')).toBe(false);
  });
});

describe('openKey has ONE writer', () => {
  // A2's "one OPEN debate per (thesis, record)" as a nullable column under an
  // ordinary unique index — Postgres does not collide NULLs, so any number of
  // CLOSED sessions coexist for one pair. The index cannot enforce the "while
  // OPEN" half of the rule; ONE WRITER is what does, and this is that rule.
  const ASSIGNS_OPEN_KEY = /openKey\s*:/;

  it('no module assigns openKey — the debate module is built at step 13', () => {
    const offenders = modules()
      .filter(({ file }) => file !== 'services/openDebate.ts')
      .filter(({ code }) => ASSIGNS_OPEN_KEY.test(code))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('DETECTS a planted assignment', () => {
    expect(ASSIGNS_OPEN_KEY.test('data: { openKey: `${thesisId}:${recordFileHash}` }')).toBe(true);
    expect(ASSIGNS_OPEN_KEY.test('const key = openKeyFor(session);')).toBe(false);
  });
});

describe('the debate writes its own tables and nothing else does', () => {
  // The three modules evidence step 13 builds are the only writers of the debate
  // and its events. Nothing about `DiffDebateSession` was scanned before this
  // step, because nothing wrote one: the tables existed with no writer since the
  // legacy switch deleted `services/diffDebate`.
  const DEBATE_TABLES = ['diffDebateSession', 'diffDebateEvent'] as const;
  const ALLOWED = [
    'services/openDebate.ts',
    'services/respondInDebate.ts',
    'services/promoteFromDebate.ts',
  ];

  it('no module outside the three writes a debate or an event', () => {
    const offenders = modules()
      .filter(({ file }) => !ALLOWED.includes(file))
      .map(({ file, code }) => ({ file, tables: DEBATE_TABLES.filter((t) => writeTo(t).test(code)) }))
      .filter((m) => m.tables.length > 0);
    expect(offenders).toEqual([]);
  });

  it('the three exist and write — a scan over an empty allow-list holds nothing', () => {
    const writers = modules()
      .filter(({ file }) => ALLOWED.includes(file))
      .filter(({ code }) => DEBATE_TABLES.some((t) => writeTo(t).test(code)))
      .map(({ file }) => file);
    expect(writers.sort()).toEqual([...ALLOWED].sort());
  });

  it('DETECTS a planted write in a fourth module', () => {
    expect(writeTo('diffDebateSession').test('await prisma.diffDebateSession.update({ where });')).toBe(true);
    expect(writeTo('diffDebateEvent').test('tx.diffDebateEvent.createMany({ data })')).toBe(true);
    expect(writeTo('diffDebateSession').test('await prisma.diffDebateSession.findUnique({ where });')).toBe(false);
  });
});

describe('every write tool opens its transaction with the shared window', () => {
  // A8: the window is an operational parameter, stated ONCE in
  // `src/walk/pageLog.ts` and passed by every write tool — the staging exercise
  // of 2026-09-06 found a seventeen-rule approval rolling back under Prisma's
  // unstated five-second default.
  //
  // SCOPED BY NAME, and the three files outside it are named with their reasons.
  // `test/walk/pageLog.test.ts` holds this over `src/walk/tools/*.ts` only — an
  // invariant scoped to the wrong axis, which is why evidence step 13's three
  // services sat outside a parameter bought with a real rollback. What is NOT in
  // the list: `services/dbSimulation.ts`, whose transaction exists to measure a
  // statement and roll back rather than to write; `services/claimTrajectory.ts`,
  // Level 6's detection writer, outside this step and the walk's tool surface;
  // and `services/recordDiff.ts`, which already carries the window and opens no
  // transaction at all when it is handed a client.
  const WINDOWED = [
    'services/openDebate.ts',
    'services/respondInDebate.ts',
    'services/promoteFromDebate.ts',
  ];
  const OPENS = /\$transaction\(/g;
  const WITH_WINDOW = /,\s*WRITE_TRANSACTION\s*\)/g;

  it('every $transaction in the debate services and the walk tools carries it', () => {
    const scanned = modules().filter(
      ({ file }) => WINDOWED.includes(file) || (file.startsWith('walk/tools/') && !file.endsWith('index.ts')),
    );
    const bare = scanned
      .map(({ file, code }) => ({
        file,
        opened: (code.match(OPENS) ?? []).length,
        windowed: (code.match(WITH_WINDOW) ?? []).length,
      }))
      .filter((m) => m.opened !== m.windowed);
    expect(bare).toEqual([]);
  });

  it('finds transactions at all — a silent zero would make it vacuous', () => {
    const opened = modules()
      .filter(({ file }) => WINDOWED.includes(file))
      .reduce((n, { code }) => n + (code.match(OPENS) ?? []).length, 0);
    expect(opened).toBeGreaterThan(0);
  });

  it('DETECTS a bare transaction — the decoy pair', () => {
    expect(('return prisma.$transaction((tx) => promote(tx));'.match(WITH_WINDOW) ?? []).length).toBe(0);
    expect(
      ('return prisma.$transaction((tx) => promote(tx), WRITE_TRANSACTION);'.match(WITH_WINDOW) ?? []).length,
    ).toBe(1);
  });
});

describe("the debate's own refusal codes are produced in ONE module", () => {
  // A4 gives `open_debate` seven record checks and `promote_from_debate` re-runs
  // "every refusal of open_debate at this moment". Two implementations of "every
  // refusal" is the drift that sentence is written against, so the codes are
  // produced by `recordChecks` alone.
  //
  // MATCHED AS THE CONSTRUCTOR CALL, never as the bare word: `CONTRADICTED` is
  // also a `SurvivalVerdict` value in `lib/diffSurvival.ts` and `NARROWED` is
  // predicate vocabulary, so a scan on the word would fire on modules that are
  // right and be unfixable without a comment that lied.
  //
  // THREE CODES ARE EXCLUDED BY NAME, with the reason: `NOT_A_CAPTURE`,
  // `NO_SUCH_DIFF` and `AWAITING_DERIVATION` are legitimately produced by
  // `get_diff_input` for its own contract, and the last is also `Current`'s own
  // reason in the predicates module.
  const DEBATE_ONLY = ['NOT_ACQUIRED', 'NOT_CITED', 'CONTRADICTED', 'NOTHING_TO_PROMOTE', 'NARROWED'];
  const produces = (code: string): RegExp => new RegExp(`refusal\\(\\s*'${code}'`);

  it('only services/openDebate.ts produces them', () => {
    const offenders = modules()
      .filter(({ file }) => file !== 'services/openDebate.ts')
      .map(({ file, code }) => ({ file, codes: DEBATE_ONLY.filter((c) => produces(c).test(code)) }))
      .filter((m) => m.codes.length > 0);
    expect(offenders).toEqual([]);
  });

  it('and it produces every one of them — the rule has a subject', () => {
    const checks = modules().find(({ file }) => file === 'services/openDebate.ts');
    expect(DEBATE_ONLY.filter((c) => produces(c).test(checks?.code ?? ''))).toEqual(DEBATE_ONLY);
  });

  it('DETECTS a planted production, and does not fire on the bare word', () => {
    expect(produces('NARROWED').test("return refusal('NARROWED', 'the pair is no longer finest');")).toBe(true);
    expect(produces('CONTRADICTED').test("const v: SurvivalVerdict = 'CONTRADICTED';")).toBe(false);
  });
});

describe('the debate reaches no chain', () => {
  // §5: "No research act writes to the chain." The registry's one caller is held
  // above; this is the narrower rule for the three modules a research act runs
  // through, and it catches an IMPORT rather than a call — a module that imports
  // the anchoring path has already made the mistake reachable.
  const DEBATE_MODULES = [
    'services/openDebate.ts',
    'services/respondInDebate.ts',
    'services/promoteFromDebate.ts',
    'services/promotionAssessor.ts',
    'services/debateState.ts',
    'services/debatePassage.ts',
  ];
  const CHAIN = /from '[^']*(?:Web3Service|anchorSnapshots)'/;

  it('no debate module imports Web3Service or the anchoring module', () => {
    const offenders = modules()
      .filter(({ file }) => DEBATE_MODULES.includes(file))
      .filter(({ code }) => CHAIN.test(code))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('finds the modules at all', () => {
    const found = modules().filter(({ file }) => DEBATE_MODULES.includes(file)).map(({ file }) => file);
    expect(found.sort()).toEqual([...DEBATE_MODULES].sort());
  });

  it('DETECTS a planted import', () => {
    expect(CHAIN.test("import { Web3Service } from '../services/Web3Service';")).toBe(true);
    expect(CHAIN.test("import { writesAllowed } from './anchorSnapshots';")).toBe(true);
    expect(CHAIN.test("import { recordId } from '../lib/evidenceIdentity';")).toBe(false);
  });
});

describe('every predicate of A3 has ONE importable symbol', () => {
  // "A source scan that fails on a second spelling of VERIFIED, CURRENT or
  // PUBLISHABLE" — the publication gate CALLS the predicates and never
  // re-derives them, because a second spelling inside the gate is the copy that
  // drifts. The predicate and the gate are one implementation.
  //
  // EXTENDED AT EVIDENCE STEP 12 with every predicate the reads build, and the
  // PATTERN was widened with them: the first spelling required `(` immediately
  // after the name, so `function currentVersionOf<V extends …>(` — a GENERIC
  // declaration, which three of these are — matched nothing. A scan that cannot
  // see the shape the code is actually written in is the vacuity this file's
  // header names, arriving as a green test. `[<(]` is what closes it, and the
  // decoy below is planted in BOTH shapes so it cannot narrow again silently.
  const NAMES = [
    'verified',
    'publishable',
    'currentVersionOf',
    'needsReview',
    'citationCurrent',
    'narrowed',
    'intervening',
    'publicPage',
    'recomputable',
    'flagged',
    'argued',
    // ATTRIBUTED IS THE ONE WHOSE CORRECT COUNT IN THE TREE IS ZERO, and that is
    // the point rather than an oversight. Its single implementation is
    // `attributeClaim` in services/registryState.ts — one function serving the
    // ledger, the audits, the anchor-time check and the per-capture reads
    // through an entry-lookup parameter. A module declaring `function
    // attributed(` would be a SECOND spelling of a predicate that reads the
    // chain, which is exactly the drift this scan exists to catch.
    'attributed',
  ];

  /** One list, one set of patterns — a second list is the copy that drifts. */
  const SPELLINGS = NAMES.map((name) => new RegExp(`function\\s+${name}\\s*[<(]`));

  it('no module but evidencePredicates declares one', () => {
    const offenders = modules()
      .filter(({ file }) => file !== 'services/evidencePredicates.ts')
      .filter(({ code }) => SPELLINGS.some((re) => re.test(code)))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('DETECTS a second spelling, and does not fire on a call', () => {
    expect(SPELLINGS.some((re) => re.test('export function verified(e: Evidence) { return true; }'))).toBe(true);
    expect(SPELLINGS.some((re) => re.test('const isVerified = await verified(e);'))).toBe(false);
  });

  it('DETECTS a planted declaration of EVERY name it lists, GENERIC OR PLAIN', () => {
    // A list is only a rule if every entry can fire, in every shape the codebase
    // writes. Written as a property over the list itself, so a name added
    // tomorrow gets its decoys for free.
    for (const name of NAMES) {
      const plain = `export function ${name}(input: unknown) { return true; }`;
      const generic = `export function ${name}<V extends Row>(input: V) { return true; }`;
      expect(SPELLINGS.some((re) => re.test(plain))).toBe(true);
      expect(SPELLINGS.some((re) => re.test(generic))).toBe(true);
      expect(SPELLINGS.some((re) => re.test(`const answer = await ${name}(input);`))).toBe(false);
    }
  });

  it('the predicates module DECLARES the ones this step built, so the rule has a subject', () => {
    // A scan whose allow-listed module declares nothing would pass over an empty
    // tree. These are the names steps 12 and 13 put there; `attributed` and
    // `publishable` are deliberately NOT among them — the first has its one
    // spelling elsewhere (registryState.attributeClaim), the second is step 15's.
    const predicates = modules().find(({ file }) => file === 'services/evidencePredicates.ts');
    expect(predicates).toBeDefined();
    const built = [
      'currentVersionOf',
      'needsReview',
      'citationCurrent',
      'narrowed',
      'intervening',
      'publicPage',
      'recomputable',
      'verified',
      'flagged',
      'argued',
    ];
    const declared = built.filter((name) =>
      new RegExp(`function\\s+${name}\\s*[<(]`).test(predicates?.code ?? ''),
    );
    expect(declared).toEqual(built);
  });
});
