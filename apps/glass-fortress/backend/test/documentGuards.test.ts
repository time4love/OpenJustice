import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENT_EXTRACTOR, extract } from '../src/lib/documentExtractor';
import { FIXTURES, FIXTURE_KINDS, docIdOf } from './documentFixtureBytes';
import { HISTORY, SCHEMA, decoysFor, problemsWith, type CheckSpec } from './migrationChecks';
import { SRC, readCode, tsFiles } from './walk/scan';

// ---------------------------------------------------------------------------
// THE DOCUMENT LAYER'S GUARDS THAT A MERGE MUST PASS — document refactor steps 28 and 29.
//
// WHY THIS FILE IS IN THE UNIT PROJECT, and it is the whole reason it exists. A CHECK
// constraint is invisible to Prisma and to `db:check-drift`, so a case holding one is the
// ONLY thing that holds it — and the `document` acceptance project is NOT in `npm test`'s
// selected projects until step 36 (`jest.config.ts` :119-:121, plan :121). A CHECK case
// written in `test/document/` would therefore hold NOTHING a merge must pass, for eight
// steps. That gap was recorded and not closed at thesis step 18
// (docs/gf-thesis-step-18-2026-09-11.md §7, "The evidence layer's CHECK guards have the
// same gap, one layer down: recorded here, not fixed here"); this is the document layer
// declining to inherit it.
//
// THE MECHANISM IS `test/migrationChecks.ts` AND IT IS NOT COPIED. Each CHECK is held
// across the WHOLE ordered migration history: ADDED by exactly one migration, every arm
// inside THAT statement, no LATER migration dropping it, and named in the model's `///`
// comment in `schema.prisma`. Whitespace is normalised by NORMALISE's one symbol.
//
// EXHAUSTIVE, NOT ILLUSTRATIVE. Every CHECK step 28's migration writes is in the map
// below, and the last case in this file proves the map is COMPLETE against the migration
// itself — a constraint in the SQL and absent from the map is precisely the defect this
// guard exists to catch, and a map that listed four of five would otherwise pass forever.
// ---------------------------------------------------------------------------

/**
 * Document flows A2 — each constraint, the model that names it, and its arms.
 *
 * EACH REQUIRES AND FORBIDS NOTHING BEYOND WHAT A2 STATES (thesis step 18's ruling 7).
 * Where A2 writes "iff" it states BOTH directions and the arm says both; where it writes
 * "REQUIRED on X" the arm requires and leaves the other kinds alone.
 */
const CHECKS: Record<string, CheckSpec> = {
  /** A2 :1280-:1284 — one arm per door, the shape `Evidence_one_record_key` already takes. */
  Arrival_fields_by_door: {
    model: 'Arrival',
    arms: [
      `("door" = 'INTAKE' AND "thesisId" IS NOT NULL AND "termsHash" IS NOT NULL AND "researcherId" IS NULL)`,
      `("door" = 'RESEARCHER' AND "thesisId" IS NULL AND "termsHash" IS NULL AND "researcherId" IS NOT NULL AND "gapId" IS NULL)`,
    ],
  },
  /** A2 :1319-:1323 — a sender's withdrawal is attributed to nobody and carries no reason. */
  Shed_fields_by_cause: {
    model: 'Shed',
    arms: [
      `("cause" = 'OPERATOR' AND "researcherId" IS NOT NULL AND "reason" IS NOT NULL)`,
      `("cause" = 'SENDER' AND "researcherId" IS NULL AND "reason" IS NULL)`,
    ],
  },
  /**
   * A2 :1271 — `title` is REQUIRED at the RESEARCHER's door, and that door is HELD always
   * (§2 :163; architecture §11.7 :704), so on the row it reads: bytes present implies a
   * title. THE DOOR IS THE ARRIVAL'S AND A CHECK CANNOT SPAN TABLES; custody is derived
   * from this row's own columns (A2 :1274), so this is the one formulation available and
   * it is exactly equivalent given door-implies-custody.
   */
  Document_title_required_when_held: {
    model: 'Document',
    arms: [`"bytes" IS NULL OR "title" IS NOT NULL`],
  },
  /**
   * A2 :1339-:1341 — WIDENED from two arms to three at this step, the direct parallel of
   * `Evidence_one_record_key`. A debate carries no `kind` column, so "matching the record's
   * kind" IS "exactly one key is set": the kind is which one.
   */
  DebateSession_one_record_key: {
    model: 'DebateSession',
    arms: [`num_nonnulls("recordSnapshotId", "recordDiffId", "recordCommitment") = 1`],
  },
};

type CheckName = keyof typeof CHECKS;

describe("the document layer's CHECK constraints — held where a merge must pass (step 28)", () => {
  it('reads the history it holds them across — a silent zero would make every case vacuous', () => {
    // THE FLOOR, and it is the first case for the reason thesisGuards states: a history
    // read as empty makes every assertion below it pass over nothing.
    expect(HISTORY.length).toBeGreaterThan(70);
  });

  for (const name of Object.keys(CHECKS) as CheckName[]) {
    it(`${name}: added by exactly one migration, every arm inside it, never dropped later, named in the schema`, () => {
      expect(problemsWith(HISTORY, SCHEMA, name, CHECKS[name])).toEqual([]);
    });

    it(`${name}: DETECTS the constraint removed, each arm removed, a later drop, the schema's name removed — every one red`, () => {
      const { histories } = decoysFor(HISTORY, name, CHECKS[name]);
      for (const history of histories) {
        expect(problemsWith(history, SCHEMA, name, CHECKS[name])).not.toEqual([]);
      }
      expect(problemsWith(HISTORY, SCHEMA.split(name).join('x'), name, CHECKS[name])).not.toEqual([]);
    });
  }
});

describe('the map is COMPLETE against step 28\'s migration — a constraint in the SQL and absent here is the defect', () => {
  const STEP_28 = '20260922200000_document_step_28_schema';

  it('every CHECK that migration adds is in the map above, and every name in the map is one it adds', () => {
    const migration = HISTORY.find(({ name }) => name === STEP_28);
    if (migration === undefined) throw new Error(`${STEP_28} is not in the history — the guard has no subject`);
    const added = [...migration.sql.matchAll(/ADD CONSTRAINT "(\w+)" CHECK/g)].map((m) => m[1]);
    // THE FLOOR: the migration adds constraints AT ALL. A file read as empty, or a regex
    // that stopped matching, would otherwise make both directions below trivially true.
    expect(added.length).toBeGreaterThanOrEqual(4);
    // ONE of the names it adds is thesis step 18's, WIDENED here rather than created here,
    // and it is held by `test/thesisGuards.test.ts` with its own arm. Naming it as the one
    // exception is what keeps "every name in the map is one it adds" exact in both
    // directions rather than approximately true.
    const heldByThesisGuards = ['ThesisMention_fields_by_kind'];
    expect([...added].sort()).toEqual([...Object.keys(CHECKS), ...heldByThesisGuards].sort());
  });

  it('DETECTS a constraint the migration adds and the map omits', () => {
    const migration = HISTORY.find(({ name }) => name === STEP_28);
    if (migration === undefined) throw new Error(`${STEP_28} is not in the history`);
    const planted = migration.sql + '\nALTER TABLE "Document" ADD CONSTRAINT "Document_unmapped" CHECK ("title" IS NOT NULL);';
    const added = [...planted.matchAll(/ADD CONSTRAINT "(\w+)" CHECK/g)].map((m) => m[1]);
    expect(added).toContain('Document_unmapped');
    expect(Object.keys(CHECKS)).not.toContain('Document_unmapped');
  });
});

describe('the enum value this step adds is never USED in the transaction that adds it', () => {
  it("`ALTER TYPE MentionType ADD VALUE 'DOCUMENT'` is safe inside one implicit transaction", () => {
    const migration = HISTORY.find(({ name }) => name === '20260922200000_document_step_28_schema');
    if (migration === undefined) throw new Error('step 28 is not in the history');
    // Comments stripped: the prose EXPLAINS the rule and naming it there is not using it.
    const code = migration.sql.replace(/^\s*--.*$/gm, '');
    const addValue = code.match(/ALTER TYPE "MentionType" ADD VALUE 'DOCUMENT';/g) ?? [];
    // THE FLOOR: the statement is there at all, so an empty file cannot pass this.
    expect(addValue).toHaveLength(1);
    // Postgres refuses to USE a new enum value in the transaction that added it, and a
    // migration file is ONE implicit transaction (docs/gf-thesis-step-18-2026-09-11.md §6).
    // Every other occurrence in CODE would be such a use.
    expect(code.match(/'DOCUMENT'/g) ?? []).toHaveLength(1);
  });

  it('DETECTS a use planted after the ADD VALUE', () => {
    const planted = `ALTER TYPE "MentionType" ADD VALUE 'DOCUMENT';\nALTER TABLE "ThesisMention" ADD CONSTRAINT "x" CHECK ("kind" <> 'DOCUMENT');`;
    expect(planted.match(/'DOCUMENT'/g) ?? []).toHaveLength(2);
  });
});

describe('no migration of this layer carries a transaction statement — the file IS one', () => {
  it('step 28 has no BEGIN and no COMMIT', () => {
    const migration = HISTORY.find(({ name }) => name === '20260922200000_document_step_28_schema');
    if (migration === undefined) throw new Error('step 28 is not in the history');
    // `test/migrationsOneTransaction.test.ts` holds this across every migration; this case
    // is the document layer saying it of its own, where a reader of this file will look.
    expect(/^\s*(BEGIN|COMMIT)\b/im.test(migration.sql)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// STEP 29 (a) — ONE SYMBOL FOR THE EXTRACTOR, AND THE SCAN IS EXACT-CASE.
//
// A1 :1247-:1248 gives `CURRENT_EXTRACTOR` one importable symbol, for the reason
// `ANCHOR_SCHEME` has one (`lib/anchoredCaptureHash.ts` :54-:58): the rule and its name
// move together, or a second place to change is left behind. Its VALUE is part (b)'s
// dependency choice and is null until then.
//
// WHY EXACT-CASE IS THE WHOLE POINT. `src/walk/derivations.ts` :305 and :357 take a
// LOWERCASE PARAMETER `currentExtractor` — the CORPUS's extractor, whose constant is
// `TEXT_EXTRACTION_VERSION` in `lib/captureDocument.ts`, a different symbol for a
// different layer. A case-insensitive scan matches that parameter, reports a "second
// spelling" that is not one, and sends a builder to delete a correct local. A scan that
// lies is worse than no scan, so both directions are held below: the document symbol has
// exactly one declaration, AND the corpus's local is present and is not counted.
// ---------------------------------------------------------------------------

const declarations = (symbol: string, source: string): number =>
  (source.match(new RegExp(`export const ${symbol}\\b`, 'g')) ?? []).length;

describe('A1 :1247-:1248 — CURRENT_EXTRACTOR has ONE importable symbol (step 29a)', () => {
  const sources = tsFiles(SRC).map((file) => ({ file, code: readCode(file) }));

  it('reads the source tree it scans — a silent zero would make every case below vacuous', () => {
    // THE FLOOR: the tree has files at all, and one of them is the module in question.
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.some(({ file }) => file.endsWith('lib/documentExtractor.ts'))).toBe(true);
  });

  it('exactly ONE module declares it, and it is lib/documentExtractor.ts', () => {
    const declaring = sources.filter(({ code }) => declarations('CURRENT_EXTRACTOR', code) > 0);
    expect(declaring.map(({ file }) => file.slice(SRC.length + 1))).toEqual(['lib/documentExtractor.ts']);
    expect(declarations('CURRENT_EXTRACTOR', declaring[0]?.code ?? '')).toBe(1);
  });

  it('the CORPUS\'s lowercase `currentExtractor` is PRESENT and is NOT counted — the exact-case half', () => {
    const derivations = sources.find(({ file }) => file.endsWith('walk/derivations.ts'));
    if (derivations === undefined) throw new Error('src/walk/derivations.ts is not in the tree — the scan has no subject');
    // It is there, as a parameter, twice (:305 and :357) — the FLOOR on this direction.
    expect(derivations.code).toContain('currentExtractor');
    // And it declares none of the document layer's symbol.
    expect(declarations('CURRENT_EXTRACTOR', derivations.code)).toBe(0);
  });

  it('DETECTS a second declaration planted elsewhere, and does NOT fire on the lowercase local', () => {
    const planted = "export const CURRENT_EXTRACTOR = 'v1-some-other-place';";
    expect(declarations('CURRENT_EXTRACTOR', planted)).toBe(1);
    // The decoy that proves the case-sensitivity: the corpus's spelling, planted as a
    // declaration, must still not count. A loose scan would report it and be wrong.
    const lowercasePlant = "export const currentExtractor = 'the corpus\'s, a different thing';";
    expect(declarations('CURRENT_EXTRACTOR', lowercasePlant)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// STEP 29 (b) — `verdict-rule-one-spelling`, A7 :1579-:1581, plan §4 :411.
//
// "one importable symbol computes PRESENT | ABSENT | UNCHECKED, and PassageVerdict,
// the framing assessor's audit and the critic's audit call it; nothing else spells
// it." The symbol is THESIS STEP 19'S — `src/lib/verdict.ts` :28 — and document step
// 29 adds NOTHING to it (plan :162-:164); what this step adds is its FIRST CALLER
// WITH NULL TEXT, and this scan, which the plan assigns to step 29 rather than to
// the step that built the rule.
//
// IT SCANS FOR A DECLARATION AND NOT FOR THE WORDS, and the difference is the whole
// instrument. `src/lib/phraseVerifiedRate.ts` NARROWS a stored verdict and prints
// the three names — it reads them, it does not compute one — so a scan keyed on the
// literals appearing together would report it as a second spelling and send a
// builder to break a correct module. A scan that lies is worse than no scan, which
// is the lesson the exact-case guard above was written from. Both directions are
// held: exactly one module DECLARES the union, and the module that merely reads the
// values is asserted present and NOT counted.
// ---------------------------------------------------------------------------

/** A declaration of the union — the three values as alternatives, not as mentions. */
const UNION = /'PRESENT'\s*\|\s*'ABSENT'\s*\|\s*'UNCHECKED'/;

describe('A7 :1579-:1581 — the verdict rule has ONE spelling (step 29b)', () => {
  const sources = tsFiles(SRC).map((file) => ({ file, code: readCode(file) }));

  it('reads the source tree it scans — a silent zero would make every case below vacuous', () => {
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.some(({ file }) => file.endsWith('lib/verdict.ts'))).toBe(true);
  });

  it('exactly ONE module declares PRESENT | ABSENT | UNCHECKED, and it is thesis step 19’s', () => {
    const declaring = sources.filter(({ code }) => UNION.test(code));
    expect(declaring.map(({ file }) => file.slice(SRC.length + 1))).toEqual(['lib/verdict.ts']);
  });

  it('the document layer CALLS it rather than spelling it — A3 :1385-:1386 over CURRENT(d).text', () => {
    const predicates = sources.find(({ file }) => file.endsWith('services/documentPredicates.ts'));
    if (predicates === undefined) throw new Error('services/documentPredicates.ts is not in the tree — the scan has no subject');
    expect(predicates.code).toMatch(/from '\.\.\/lib\/verdict'/);
    expect(UNION.test(predicates.code)).toBe(false);
  });

  it('a module that READS the three values is present and is NOT counted — the other direction', () => {
    const reader = sources.find(({ file }) => file.endsWith('lib/phraseVerifiedRate.ts'));
    if (reader === undefined) throw new Error('lib/phraseVerifiedRate.ts is not in the tree — the scan has no negative subject');
    // It narrows a STORED verdict and names all three; it computes none.
    expect(reader.code).toContain("'UNCHECKED'");
    expect(UNION.test(reader.code)).toBe(false);
  });

  it('DETECTS a second spelling planted elsewhere, and does not fire on a mention', () => {
    expect(UNION.test("export type Verdict = 'PRESENT' | 'ABSENT' | 'UNCHECKED';")).toBe(true);
    expect(UNION.test("if (v !== 'PRESENT' && v !== 'ABSENT' && v !== 'UNCHECKED') return null;")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// STEP 29 (b) — THE FIXTURE SET IS FOUR KINDS, AND IT IS REPRODUCIBLE.
//
// The researcher ruled the fixtures SYNTHETIC and generated (2026-09-23), and the
// point of generating them is that the bytes can be CHECKED rather than trusted:
// `extractor-coverage` measures the extractor over these exact files, so a fixture
// that drifted would move a measurement without anyone editing a number.
//
// `test/documentFixtureBytes.ts` is their only author. These cases regenerate every
// file in memory and refuse a byte that differs, which is what makes "deterministic"
// a property a merge holds. THEY ARE IN THE UNIT PROJECT for this file's own reason:
// the `document` project is not in `npm test` until step 36, so a case living there
// would hold nothing a merge must pass.
// ---------------------------------------------------------------------------

describe('the four fixture kinds — plan :157 as amended 2026-09-23 (step 29b)', () => {
  const DIRECTORY = join(__dirname, '..', 'fixtures', 'documents');
  const manifest = JSON.parse(readFileSync(join(DIRECTORY, 'manifest.json'), 'utf8')) as {
    kinds: number;
    fixtures: { kind: string; file: string; mimeType: string; byteLength: number; docId: string }[];
  };

  it('is FOUR kinds — the paste was retired 2026-09-23 and the set is not five', () => {
    // THE FLOOR and the ceiling at once: a set that lost a kind, or kept the paste,
    // fails here rather than in a count nobody reads.
    expect(FIXTURE_KINDS).toEqual(['PDF_TEXT_LAYER', 'SCAN', 'SPREADSHEET', 'UNREADABLE']);
    expect(manifest.kinds).toBe(4);
    expect(manifest.fixtures).toHaveLength(4);
  });

  it('the manifest names exactly the files on disk, and every kind exactly once', () => {
    const onDisk = readdirSync(DIRECTORY).filter((name) => name !== 'manifest.json').sort();
    expect(manifest.fixtures.map((f) => f.file).sort()).toEqual(onDisk);
    expect([...new Set(manifest.fixtures.map((f) => f.kind))]).toHaveLength(4);
  });

  it.each(FIXTURE_KINDS)('%s: the committed bytes are EXACTLY what the generator produces', (kind) => {
    const fixture = FIXTURES.find((f) => f.kind === kind);
    if (fixture === undefined) throw new Error(`${kind} is not in FIXTURES — the generator and the kinds disagree`);
    const committed = readFileSync(join(DIRECTORY, fixture.file));
    const regenerated = fixture.bytes();
    // `equals` and not a hash comparison: the failure then says which file, and a
    // byte count, rather than two digests a reader has to diff by eye.
    expect(committed.equals(regenerated)).toBe(true);
  });

  it.each(FIXTURE_KINDS)('%s: the manifest’s docId is the sha256 of the committed bytes', (kind) => {
    const entry = manifest.fixtures.find((f) => f.kind === kind);
    const fixture = FIXTURES.find((f) => f.kind === kind);
    if (entry === undefined || fixture === undefined) throw new Error(`${kind} is missing from the manifest or the generator`);
    const committed = readFileSync(join(DIRECTORY, fixture.file));
    expect(docIdOf(committed)).toBe(entry.docId);
    expect(committed.length).toBe(entry.byteLength);
  });

  it('DETECTS a drifted fixture — one byte changed is caught, which is the whole point', () => {
    const fixture = FIXTURES.at(0);
    if (fixture === undefined) throw new Error('the fixture set is empty — the decoy has no subject');
    const drifted = Buffer.from(fixture.bytes());
    drifted[drifted.length - 1] = (drifted.at(-1) ?? 0) ^ 0xff;
    expect(drifted.equals(fixture.bytes())).toBe(false);
    expect(docIdOf(drifted)).not.toBe(docIdOf(fixture.bytes()));
  });

  it('EXACTLY ONE kind has NO GROUND TRUTH — the file no engine reads', () => {
    // RETITLED, round 2. The title said "exactly ONE kind is bytes-only", and under
    // `ocr-none` TWO are — the SCAN and this one — while the body checks which fixture
    // has an EMPTY GROUND TRUTH, a different property. A case's title can outlive its
    // assertion, and a reader grades against the title. The bytes-only COUNT is asserted
    // by name in the reason-code case below, against the reader's real answers.
    const groundTruthless = FIXTURES.filter((f) => f.groundTruth === '').map((f) => f.kind);
    expect(groundTruthless).toEqual(['UNREADABLE']);
  });

  it('THE THREE KINDS JEST CAN LOAD reach THREE DISTINCT answers — the fourth is named below', async () => {
    // WHY THIS CASE EXISTS. Round 1's fourth fixture was a PNG, so it took the IMAGE
    // class and came back `OCR_NONE` with zero characters — the SAME arm, reason and
    // count as the SCAN. The set the plan builds to judge the extractor (:154-:157)
    // measured THREE distinguishable outcomes while reporting four kinds, and
    // `NO_READER_FOR_TYPE` had no fixture at all. The fourth fixture is now an AUDIO file
    // and the four kinds DO reach four distinct answers — measured under plain Node and
    // recorded in the step's dated doc.
    //
    // THE TITLE SAYS THREE BECAUSE THE CASE ASSERTS THREE, and that is the whole lesson of
    // the case ten lines above it. Round 2's version was titled "the FOUR kinds reach FOUR
    // DISTINCT answers" and asserted three — the same defect, committed in the act of
    // retitling the other one. A title is what a reader grades against.
    //
    // THE PDF IS ABSENT FOR A HARNESS REASON, MEASURED AND NAMED, NOT ASSUMED.
    // `pdfjs-dist` 6.3.289 is ESM-only; `documentExtractor.ts`'s header records the three
    // load mechanisms measured failing inside jest, including Node's own `createRequire`,
    // which does not escape jest's `Module._load` hook. Its arm is exercised by
    // `extractor-coverage` under plain Node. THIS IS STATED RATHER THAN IMPLIED: a case
    // that looked like four-kind coverage and was not is worse than a gap with a name.
    const loadable = FIXTURES.filter((fixture) => fixture.mimeType !== 'application/pdf');
    expect(loadable).toHaveLength(3);
    // The floor on the exclusion itself: exactly ONE kind is left out, and it is the PDF.
    expect(FIXTURES.filter((fixture) => fixture.mimeType === 'application/pdf').map((f) => f.kind)).toEqual([
      'PDF_TEXT_LAYER',
    ]);

    const answers = await Promise.all(
      loadable.map(async (fixture) => {
        const extraction = await extract(fixture.bytes(), fixture.mimeType);
        return { kind: fixture.kind, reason: extraction.reason ?? 'COMPUTED', computed: extraction.text !== null };
      }),
    );
    expect(answers).toEqual([
      { kind: 'SCAN', reason: 'OCR_NONE', computed: false },
      { kind: 'SPREADSHEET', reason: 'COMPUTED', computed: true },
      { kind: 'UNREADABLE', reason: 'NO_READER_FOR_TYPE', computed: false },
    ]);
    // THE FLOOR, as a count so a blinded reader cannot satisfy it: three kinds, three
    // DISTINCT reasons. Round 1's set would have given two of them the same one.
    expect(new Set(answers.map((answer) => answer.reason)).size).toBe(3);
  }, 30000);
});

// ---------------------------------------------------------------------------
// STEP 29 (b), ROUND 2 — THE VERSION STRING NAMES EVERY READER'S ENGINE AND BUILD.
//
// Ruling §6.6 :198-:206 is explicit that each stage of `CURRENT_EXTRACTOR` names its
// engine and its build. Round 1 shipped `…-ocr-none-xlsxcells-nfc`: `pdfjs6.3.289`
// named reader, version AND policy, while the spreadsheet stage was the POLICY ALONE.
// `exceljs` decodes date serials, shared and inline strings and cached formula
// results, so AN UPGRADE CAN MOVE EVERY SPREADSHEET'S COMPUTED TEXT WHILE
// `CURRENT_EXTRACTOR` STANDS STILL — every pinned citation would then name a version
// that no longer describes what produced it, and `extractor-coverage` cannot see it
// (it counts WHETHER text was derived, never whether it is right).
//
// SO THE STRING IS TIED TO THE MANIFEST, IN BOTH DIRECTIONS. A version bumped in
// `package.json` without moving the string fails here, and a string naming a version
// the manifest does not declare fails here too. A caret range fails as well: the
// string claims a PINNED reader, and a range lets the reader move under it.
// ---------------------------------------------------------------------------

describe('CURRENT_EXTRACTOR names each reader’s engine AND build (step 29b, round 2)', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };

  /** Each stage: the declared package, and the prefix the string spells it with. */
  const STAGES = [
    { package: 'pdfjs-dist', stage: 'pdfjs' },
    { package: 'exceljs', stage: 'exceljs' },
  ] as const;

  it('reads a manifest that really declares both readers — a missing one would make this vacuous', () => {
    for (const { package: name } of STAGES) {
      expect(typeof manifest.dependencies[name]).toBe('string');
    }
  });

  it('every reader is EXACT-pinned — a range would let the reader move under the version', () => {
    for (const { package: name } of STAGES) {
      expect(manifest.dependencies[name]).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it('the version string carries each reader’s declared version', () => {
    for (const { package: name, stage } of STAGES) {
      expect(CURRENT_EXTRACTOR).toContain(`${stage}${String(manifest.dependencies[name])}`);
    }
  });

  it('DETECTS a reader that moved without the string — proven against the shape it exists to catch', () => {
    const drifted: Record<string, string> = { ...manifest.dependencies, exceljs: '5.0.0' };
    const carries = STAGES.every(({ package: name, stage }) =>
      CURRENT_EXTRACTOR.includes(`${stage}${String(drifted[name])}`),
    );
    expect(carries).toBe(false);
    // And the other direction: the real manifest still passes the same predicate.
    expect(
      STAGES.every(({ package: name, stage }) =>
        CURRENT_EXTRACTOR.includes(`${stage}${String(manifest.dependencies[name])}`),
      ),
    ).toBe(true);
  });
});
