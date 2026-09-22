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
