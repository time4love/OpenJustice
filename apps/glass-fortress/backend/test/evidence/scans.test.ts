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

// THE ONE LIST OF A3's NAMES, at file scope since evidence step 15 — the
// one-symbol scan and the gate's own rule both read it (§5b: "over the same
// NAMES list the one-symbol scan uses"). Its reasoning is in the one-symbol
// block below, where it was written; only its position moved.
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
  // EXTENDED AT EVIDENCE STEP 14 WITH TWO NAMES THAT ARE NOT A3 PREDICATES,
  // and that is a fact about A3's list rather than about their shape. §6's
  // containment rule has A3's exact failure mode: §7's narrowing material is
  // already a SECOND consumer inside this very step, and thesis T6's own
  // reviews list is a third when it is built, so a second spelling in any of
  // them is the copy that drifts. Both are EXPORTED from
  // `services/evidencePredicates.ts` on the ruling of 2026-09-09.
  'movedBetween',
  'whereChunksWent',
  // AND `contains` IS DELIBERATELY NOT HERE. It is module-private, and this
  // scan's own sentence is "every predicate of A3 has ONE **importable**
  // symbol" — a helper nobody can import cannot be a second spelling anyone
  // imports. A generic name in this list would also carry a false positive it
  // could never shed: the pattern is `function <name>\s*[<(]` over EVERY
  // module, so an unrelated `function contains(` written tomorrow would fire a
  // case with no way to satisfy it but a comment that lied about what it
  // checks — the shape step 13 rejected for the bare-word refusal codes.
  // ATTRIBUTED IS THE ONE WHOSE CORRECT COUNT IN THE TREE IS ZERO, and that is
  // the point rather than an oversight. Its single implementation is
  // `attributeClaim` in services/registryState.ts — one function serving the
  // ledger, the audits, the anchor-time check and the per-capture reads
  // through an entry-lookup parameter. A module declaring `function
  // attributed(` would be a SECOND spelling of a predicate that reads the
  // chain, which is exactly the drift this scan exists to catch.
  'attributed',
];

const modules = () =>
  tsFiles(SRC).map((file) => ({ file: relative(SRC, file), code: readCode(file) }));

const EVIDENCE_TABLES = ['evidence', 'evidenceDecision', 'thesisMention'] as const;

/** Every verb Prisma writes with — the removal pair is `removeFrom`'s, below. */
const WRITE_VERBS = ['create', 'createMany', 'update', 'updateMany', 'upsert'] as const;

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

describe('the evidence tables are written BY TABLE AND VERB, at the site each act belongs to', () => {
  // A7 names three writers — `promote_from_debate`, `review_evidence` and the
  // thesis version write — and this scan held that as a list of FILES until
  // evidence step 14. Per file, `services/reviewEvidence.ts` was allowed to write
  // ALL THREE tables, so a `thesisMention.update` in the review path — a silent
  // RE-PIN, which §6 forbids in terms and which the whole design rests on not
  // happening — would have passed. The gap was accepted at 11b and again at 13,
  // when neither writer existed; it is repaired here, by the map the acceptance
  // lines actually state.
  //
  // ONE SCAN OVER THE MAP, not one per row. Seven rules with seven cases would be
  // one rule with seven implementations — this repository's dominant defect shape
  // — and the offender's own string is what names which row it broke.
  interface WriterRule {
    table: (typeof EVIDENCE_TABLES)[number];
    verbs: readonly (typeof WRITE_VERBS)[number][];
    /** The modules that may write it. EMPTY means NOWHERE, and the reason is above the row. */
    allowed: readonly string[];
    why: string;
  }

  const WRITER_MAP: readonly WriterRule[] = [
    {
      table: 'evidence',
      verbs: ['create'],
      allowed: ['services/promoteFromDebate.ts'],
      why: 'a row is created by ONE cleared argument for ONE record (§4)',
    },
    {
      table: 'evidence',
      verbs: ['update', 'updateMany'],
      allowed: ['services/reviewEvidence.ts'],
      why: "the standing and `affirmed` move by a researcher's review, and nowhere else (§6, §9)",
    },
    {
      table: 'evidence',
      verbs: ['upsert'],
      allowed: [],
      why:
        'an upsert is NEITHER act: a row is created by a cleared argument and updated by a ' +
        'review, and an upsert would let a write assert `status` without stating which act it was',
    },
    {
      // ADDED BY DEV BEYOND THE SKETCH'S SEVEN ROWS, on §4's own word, and
      // declared: promotion clears ONE argument for ONE record and A4's return is
      // one `fileHash`, so a bulk insert would create rows no debate cleared.
      // Without this row the verb is covered by NO rule and is therefore
      // UNSCANNED — which the coverage case below is what makes visible.
      table: 'evidence',
      verbs: ['createMany'],
      allowed: [],
      why: 'promotion is one record, argued; a bulk insert creates rows no debate cleared (§4)',
    },
    {
      table: 'evidenceDecision',
      verbs: ['create', 'createMany'],
      allowed: ['services/reviewEvidence.ts'],
      why: 'the review log is written by the review, and by nothing else (§9)',
    },
    {
      table: 'evidenceDecision',
      verbs: ['update', 'updateMany', 'upsert'],
      allowed: [],
      why: 'the review log is APPEND-ONLY (A2); a decision that could be edited is not a log',
    },
    {
      table: 'thesisMention',
      verbs: ['create', 'createMany'],
      allowed: ['services/thesisVersionWrite.ts'],
      why: 'a mention is created by the version write alone (thesis A2) — absent until thesis step 20',
    },
    {
      table: 'thesisMention',
      verbs: ['update', 'updateMany'],
      allowed: ['services/promoteFromDebate.ts'],
      why:
        'the ONE write a mention receives after creation is its argument, by reference (thesis ' +
        'A2) — and it is NOT the review\'s: "the citations are NOT re-pinned by this act" (§6)',
    },
    {
      // ADDED BY DEV, as `evidence.createMany` is, and for the same reason: a verb
      // no row names is a verb nothing scans. A mention is created by the version
      // write and updated once by promotion; an upsert states neither.
      table: 'thesisMention',
      verbs: ['upsert'],
      allowed: [],
      why: 'created by the version write, updated once by promotion; an upsert is neither (thesis A2)',
    },
  ];

  /** A write to one table by one rule's verbs — never by the table alone. */
  const writesBy = (rule: WriterRule): RegExp =>
    new RegExp(`\\.${rule.table}\\.(?:${rule.verbs.join('|')})\\s*\\(`);

  it('the map covers EVERY write verb of EVERY evidence table — an uncovered verb is unscanned', () => {
    // The property that makes the eight rows a RULE rather than eight examples.
    // The first draft of the map named `evidence.create` and not
    // `evidence.createMany`, so a bulk insert of evidence rows would have been
    // permitted by silence — the same shape as the per-file list this scan
    // replaces, one level down.
    const uncovered = EVIDENCE_TABLES.flatMap((table) =>
      WRITE_VERBS.filter(
        (verb) => !WRITER_MAP.some((rule) => rule.table === table && rule.verbs.includes(verb)),
      ).map((verb) => `${table}.${verb}`),
    );
    expect(uncovered).toEqual([]);
  });

  it('every write of an evidence table is at the site the map names', () => {
    const offenders = WRITER_MAP.flatMap((rule) =>
      modules()
        .filter(({ file }) => !rule.allowed.includes(file))
        .filter(({ code }) => writesBy(rule).test(code))
        .map(({ file }) => `${file} writes ${rule.table}.${rule.verbs.join('|')} — ${rule.why}`),
    );
    expect(offenders).toEqual([]);
  });

  it('every site the map names AND the tree holds does write it — the rule has a subject', () => {
    // A map naming only files the tree does not hold would satisfy every rule
    // above over nothing. Stated as a property over what is PRESENT, so that
    // `services/thesisVersionWrite.ts` arriving at thesis step 20 is covered
    // without anyone editing this case — and so that a writer that stops writing
    // is caught rather than quietly leaving an allow-list entry behind.
    const files = modules();
    const named = WRITER_MAP.flatMap((rule) =>
      rule.allowed.flatMap((path) => {
        const held = files.find(({ file }) => file === path);
        return held === undefined ? [] : [{ rule, path, code: held.code }];
      }),
    );
    expect(named.length).toBeGreaterThan(0);
    const silent = named
      .filter(({ rule, code }) => !writesBy(rule).test(code))
      .map(({ path, rule }) => `${path} no longer writes ${rule.table}.${rule.verbs.join('|')}`);
    expect(silent).toEqual([]);
  });

  it('a rule fires on its OWN verbs and no others — the split is what the per-file list lost', () => {
    // Written as a property over the map itself, so a row added tomorrow gets its
    // decoys free, in both the `tx.` and the `prisma.` shape, and the non-firing
    // control — a READ — is asserted against every row rather than once.
    for (const rule of WRITER_MAP) {
      const pattern = writesBy(rule);
      for (const verb of WRITE_VERBS) {
        const fires = rule.verbs.includes(verb);
        expect(pattern.test(`await tx.${rule.table}.${verb}({ data: { fileHash } });`)).toBe(fires);
        expect(pattern.test(`await prisma.${rule.table}.${verb}({ data: { fileHash } });`)).toBe(fires);
      }
      expect(pattern.test(`const rows = await prisma.${rule.table}.findMany({});`)).toBe(false);
    }
  });

  it('DETECTS the re-pin the per-file list would have let through', () => {
    // The one HIGH this step names, spelled out rather than left to the property
    // above: a `thesisMention.update` inside `services/reviewEvidence.ts` is a
    // citation re-pinned by a review, and the file-shaped rule permitted it.
    const rePin = WRITER_MAP.find(
      (rule) => rule.table === 'thesisMention' && rule.verbs.includes('update'),
    );
    expect(rePin?.allowed).toEqual(['services/promoteFromDebate.ts']);
    expect(rePin?.allowed).not.toContain('services/reviewEvidence.ts');
  });
});

describe('NEEDS_REVIEW is derived and never stored — the SOURCE half', () => {
  // §9's "Derived, never stored: CURRENT, NEEDS_REVIEW, NARROWED, RECOMPUTABLE,
  // VERIFIED, CITATION_CURRENT, PUBLISHABLE, ATTRIBUTED … A predicate a pass
  // computed and stored would be a judgement the pass made."
  //
  // TWO HALVES, IN THE FILE THAT OWNS EACH AXIS. The SCHEMA half is
  // `test/evidence/invariants.test.ts` — no column is named for a derived
  // predicate — and this is the SOURCE half: no write ever names one as a field.
  // Neither implies the other: a column could exist with nothing writing it, and
  // a write could name a field the schema does not have.
  //
  // SCOPED TO A `data:` BLOCK, DELIBERATELY. The bare word is a FUNCTION with
  // legitimate callers — `services/reviewEvidence.ts` asks
  // `needsReview(row, current)` and `services/evidenceReviews.ts` asks it once
  // per row — and a scan that fired on those would be unfixable except by a
  // comment that lied about what it checks, the shape step 13 rejected for the
  // bare-word refusal codes.
  //
  // THE THIRD NET, NAMED SO THIS ONE IS NOT READ AS THE ONLY ONE. Prisma's
  // generated types reject an unknown key, so `data: { needsReview: true }` on a
  // real delegate does not compile; and a `data:` that names a VARIABLE rather
  // than a literal — `create({ data: entry })`, which this step's writer uses —
  // carries its fields somewhere this scan does not read. What this half adds is
  // the case the compiler cannot see: a literal on its way to becoming a write.
  const DERIVED = [
    'needsReview',
    'citationCurrent',
    'narrowed',
    'verified',
    'publishable',
    'flagged',
    'recomputable',
  ];

  /** Every `data:` object literal in a module, brace-balanced so a nested one is inside it. */
  const dataBlocks = (code: string): string[] => {
    const blocks: string[] = [];
    const opens = /\bdata\s*:\s*\{/g;
    let open = opens.exec(code);
    while (open !== null) {
      let depth = 0;
      for (let i = open.index + open[0].length - 1; i < code.length; i++) {
        if (code[i] === '{') depth++;
        else if (code[i] === '}') {
          depth--;
          if (depth === 0) {
            blocks.push(code.slice(open.index, i + 1));
            break;
          }
        }
      }
      open = opens.exec(code);
    }
    return blocks;
  };

  const namesDerived = (block: string): string[] =>
    DERIVED.filter((name) => new RegExp(`\\b${name}\\s*:`).test(block));

  it('no derived predicate is a field of any write under src/', () => {
    const offenders = modules().flatMap(({ file, code }) =>
      dataBlocks(code).flatMap((block) => namesDerived(block).map((name) => `${file} writes ${name}`)),
    );
    expect(offenders).toEqual([]);
  });

  it('finds `data:` blocks at all — a scan over zero blocks would pass over anything', () => {
    const blocks = modules().reduce((n, { code }) => n + dataBlocks(code).length, 0);
    expect(blocks).toBeGreaterThan(10);
  });

  it('DETECTS a planted field, and does not fire on the CALL that is right', () => {
    const planted = dataBlocks('await tx.evidence.update({ data: { needsReview: true, status } });');
    expect(planted).toHaveLength(1);
    expect(namesDerived(planted.at(0) ?? '')).toEqual(['needsReview']);
    // The call, which every reader of this rule makes and which must never fire.
    expect(dataBlocks('const owed = needsReview(evidence, current);')).toEqual([]);
    // And a nested literal is INSIDE the block, not a second one that ends early.
    const nested = dataBlocks('create({ data: { chunks: { removed: [] }, flagged: false } })');
    expect(nested).toHaveLength(1);
    expect(namesDerived(nested.at(0) ?? '')).toEqual(['flagged']);
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
  //
  // EVIDENCE STEP 14 ADDS ONE NAME AND NO NEW REASON: `services/reviewEvidence.ts`
  // is the step's only module that opens a transaction — `services/
  // evidenceReviews.ts` is a read and opens none, which is why it is absent here
  // and present in the chain list below.
  const WINDOWED = [
    'services/openDebate.ts',
    'services/respondInDebate.ts',
    'services/promoteFromDebate.ts',
    'services/reviewEvidence.ts',
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

describe('the research-act modules reach no chain', () => {
  // §5: "No research act writes to the chain." The registry's one caller is held
  // above; this is the narrower rule for the modules a research act runs through,
  // and it catches an IMPORT rather than a call — a module that imports the
  // anchoring path has already made the mistake reachable.
  //
  // RENAMED AT EVIDENCE STEP 14, AND THE OLD NAME IS HERE VERBATIM so that a
  // round's evidence is not orphaned by a rename: this block WAS
  // `the debate reaches no chain` (evidence step 13), and R34's decoy record —
  // D4, a `Web3Service` import planted in `services/debateState.ts` — names it
  // under that title. The list gains the review: `list_evidence_reviews` and
  // `review_evidence` are research acts, and §5's rule is about the acts, not
  // about the debate.
  const RESEARCH_ACT_MODULES = [
    'services/openDebate.ts',
    'services/respondInDebate.ts',
    'services/promoteFromDebate.ts',
    'services/promotionAssessor.ts',
    'services/debateState.ts',
    'services/debatePassage.ts',
    'services/reviewEvidence.ts',
    'services/evidenceReviews.ts',
    'mcp/tools/reviewEvidence.ts',
    'mcp/tools/listEvidenceReviews.ts',
    // EVIDENCE STEP 15's TWO. The gate and the instrument read the stored
    // attribution verdict through `verified` and never ask the chain themselves;
    // an import of the anchoring path here would make a chain call reachable from
    // a publication check. `evidencePredicates.ts` is deliberately NOT added — it
    // is not a research-act module, and adding it would make the list mean two
    // things.
    'services/evidenceChecks.ts',
    'services/auditTheses.ts',
  ];
  const CHAIN = /from '[^']*(?:Web3Service|anchorSnapshots)'/;

  it('no research-act module imports Web3Service or the anchoring module', () => {
    const offenders = modules()
      .filter(({ file }) => RESEARCH_ACT_MODULES.includes(file))
      .filter(({ code }) => CHAIN.test(code))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('finds the modules at all', () => {
    const found = modules()
      .filter(({ file }) => RESEARCH_ACT_MODULES.includes(file))
      .map(({ file }) => file);
    expect(found.sort()).toEqual([...RESEARCH_ACT_MODULES].sort());
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
    // tree. These are the names steps 12 to 15 put there. `attributed` is
    // deliberately NOT among them — its one spelling is elsewhere
    // (registryState.attributeClaim), and its correct count here is zero.
    // `publishable` JOINED AT EVIDENCE STEP 15, the step that built it: `NAMES`
    // had forbidden a second spelling of it since step 12, and until it was
    // declared here that half forbade a second spelling of NOTHING.
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
      // Evidence step 14's two, and they are what makes the list above a rule
      // with a subject rather than a rule about the past: a name in `NAMES` whose
      // one implementation is nowhere would forbid a second spelling of nothing.
      'movedBetween',
      'whereChunksWent',
      // Evidence step 15's — A3's PUBLISHABLE(m), every conjunct a CALL.
      'publishable',
    ];
    const declared = built.filter((name) =>
      new RegExp(`function\\s+${name}\\s*[<(]`).test(predicates?.code ?? ''),
    );
    expect(declared).toEqual(built);
  });
});

describe('the gate MAPS and does not LOAD — services/evidenceChecks.ts (§5b)', () => {
  // The one-symbol scan forbids a second `function <name>` anywhere but the
  // predicates module. It does NOT forbid the gate from re-deriving a predicate
  // INLINE — a `row.status === 'PROMOTED'` or a
  // `chunks.some((c) => c.survival === 'CONTRADICTED')` written into the gate
  // would pass every other scan in the tree. So the gate module gets its own rule,
  // and it is stricter than the global one on purpose: a module that may declare
  // NOTHING can be held to BOTH declaration spellings, where the global scan
  // cannot (a bare local `const narrowed = …` is legitimate in files this step
  // does not own — recorded as still carried for the global scan).
  //
  // A SOURCE SCAN AND A CASE, NEITHER ENOUGH ALONE. `test/evidence/
  // evidenceChecks.test.ts` asserts on what a RUN asked; this holds that the
  // FILE cannot ask anything — including tomorrow's edit that nobody runs.
  const GATE = 'services/evidenceChecks.ts';
  const PRISMA_IMPORT = /from '(?:[^']*\/lib\/prisma|@prisma\/client)'/;
  const DELEGATE = /\.(?:evidence|thesisMention|urlVersionDiff|diffContentVersion|integrityCheck)\./;
  const DECLARES = NAMES.flatMap((name) => [
    new RegExp(`function\\s+${name}\\s*[<(]`),
    new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*[:=]`),
  ]);
  const CALLS_THE_FOLD = /\bpublishableEvidence\s*\(/;

  const gate = (): string => {
    const held = modules().find(({ file }) => file === GATE);
    if (held === undefined) throw new Error(`${GATE} is not in the tree — the rule has no subject`);
    return held.code;
  };

  it('imports no Prisma client and no lib/prisma', () => {
    expect(PRISMA_IMPORT.test(gate())).toBe(false);
  });

  it('names no Prisma delegate at all', () => {
    expect(DELEGATE.test(gate())).toBe(false);
  });

  it('declares no predicate under EITHER spelling — `function <name>` AND `const <name> =`', () => {
    expect(DECLARES.filter((re) => re.test(gate())).map(String)).toEqual([]);
  });

  it('CALLS publishableEvidence — the rule has a subject', () => {
    expect(CALLS_THE_FOLD.test(gate())).toBe(true);
  });

  it('DETECTS each shape it forbids, and does not fire on a CALL to an imported predicate', () => {
    expect(PRISMA_IMPORT.test("import { prisma } from '../lib/prisma';")).toBe(true);
    expect(PRISMA_IMPORT.test("import { Prisma } from '@prisma/client';")).toBe(true);
    expect(DELEGATE.test('await prisma.evidence.findUnique({ where });')).toBe(true);
    expect(DELEGATE.test('await tx.thesisMention.findMany({ where });')).toBe(true);
    expect(DECLARES.some((re) => re.test('const publishable = async () => true;'))).toBe(true);
    expect(DECLARES.some((re) => re.test('export function verified(e: Row) { return true; }'))).toBe(true);
    expect(CALLS_THE_FOLD.test('const report = await publishableEvidence(versionId);')).toBe(true);
    // THE NON-FIRING CONTROL: calling an imported predicate is what the gate is
    // FOR, and a rule that fired on it could only be satisfied by a lie.
    for (const call of ['const report = await publishableEvidence(id);', 'const ok = argued(mention);']) {
      expect(PRISMA_IMPORT.test(call) || DELEGATE.test(call) || DECLARES.some((re) => re.test(call))).toBe(false);
    }
    // A TYPE position is not a call: `typeof publishableEvidence` must not count
    // as the gate calling the fold.
    expect(CALLS_THE_FOLD.test('type R = Awaited<ReturnType<typeof publishableEvidence>>;')).toBe(false);
  });
});
