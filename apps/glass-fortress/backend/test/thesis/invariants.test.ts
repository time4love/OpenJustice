jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { publicPage } from '../../src/services/evidencePredicates';
import { DIFF_NAME, DIFF_ROW, PAGE } from '../helpers/corpusFixture';
import { db, resetDouble, store } from '../helpers/evidenceDouble';
import { BACKEND, codeOf, columnsWritten, importSpecifiers, readCode, tsFiles, writesTo } from '../walk/scan';
import { built } from './absent';
import { A7_EXCLUDED, A7_SUITE_NAMES, MODEL_ACTORS, MODULES, TOOLS, type ModulePath } from './contract';
import { ATTEMPT, AUTHOR, MENTION, NEXT_VERSION, THESIS, TRAJECTORY_MENTION, TRAJECTORY_VERSION, VERSION } from './fixtures';
import { mentionRow } from './rows';
import { blockNamed, fieldsOf, modules, sourceOf } from './scanning';

// ---------------------------------------------------------------------------
// TARGET §10.5's NINE INVARIANTS, AND A7's STANDING LIST — the R40 sketch §5h
// (7.5b). docs/gf-architecture-target.md §10.5 :556–:566; thesis flows A7
// :1677–:1690.
//
// ONLY THE ROWS §5h MARKS "HERE" ARE WRITTEN HERE. The others are held where they
// bite and are REFERENCED, never re-spelled: CLAIM_FRAMED (`derivations.test.ts`),
// authorship and the compare-and-set (`authorship.test.ts`, `versionWrite.test.ts`),
// models write no state and no row describes another (`scans.test.ts`, `thesis-no-log`,
// `models-write-no-state`; HISTORY writes nothing, `derivations.test.ts`), a
// published version names no person (`gate.test.ts`, `names-vacuity`), and the
// registry's one caller (`test/evidence/scans.test.ts`).
//
// PUBLIC_PAGE's SUPERSEDED ARM IS HERE on 7.2 round 1's ruling (Q3): the double's
// `thesisMention.count` made honest — additively, its six consumers unedited — and a
// case that reddens on BEHAVIOUR, `publicPage` asking only the pin. The WITHDRAWAL arm
// is the evidence suite's (`test/evidence/predicates.test.ts`), not repeated.
//
// AND THE META-CASE: each of A7's eight suite names is a `describe` under
// `test/thesis/`, so an A7 name with no test is a red; the ninth is excluded by name,
// with its reason.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
});

// ---------------------------------------------------------------------------
// target §10.5 — the rows held here
// ---------------------------------------------------------------------------

describe("target §10.5 — the invariants held HERE (sketch §5h)", () => {
  it("row 1, a version's claim is one the author chose: the schema carries ThesisVersion.claim and Thesis.provision (thesis A2) (thesis step 18)", () => {
    const has = (model: string, field: string): boolean =>
      fieldsOf(blockNamed('model', model)).some((f) => f.name === field);
    expect({ 'ThesisVersion.claim': has('ThesisVersion', 'claim'), 'Thesis.provision': has('Thesis', 'provision') }).toEqual({
      'ThesisVersion.claim': true,
      'Thesis.provision': true,
    });
  });

  it("row 2, a citation's pin is computed by the write: NO thesis tool's zod schema has a key that could carry one (T2 :429) (thesis step 24 — it loads every tool's schema, and the last, list_thesis_reviews', is step 24's)", async () => {
    const keys: string[] = [];
    for (const [tool, contract] of Object.entries(TOOLS)) {
      const schemaName = Object.keys(MODULES[contract.module].exports).find((key) => key.endsWith('Schema'));
      if (schemaName === undefined) throw new Error(`contract.ts names no schema export for ${tool}`);
      const loaded = await built<Record<string, Record<string, unknown> | undefined>>(contract.module, [schemaName]);
      keys.push(...Object.keys(loaded[schemaName] ?? {}).map((key) => `${tool}.${key}`));
    }
    // THE VACUITY GUARD: seventeen schemas with no key between them would hold nothing.
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => /pin|contentversionhash|affirmed/i.test(key.split('.').at(1) ?? ''))).toEqual([]);
  });

  // ROW 6's FIRST HALF. "The publication module" is read as the two acts that move the
  // pin — `publish_thesis` (T5 :782, the pin to the head) and `unpublish_thesis` (T6
  // :909, the pin to null) — by their module paths in `contract.ts`. Read through the
  // walk's own `writesTo` / `columnsWritten`, which scope a write to its `data:` block
  // and the SET clause of a raw UPDATE, so a `where:` naming the column is not a write.
  const PUBLICATION = [TOOLS.publish_thesis.module, TOOLS.unpublish_thesis.module];
  const writesThePin = (code: string): boolean =>
    writesTo(code, 'thesis').some((region) => columnsWritten(region).includes('publishedVersionId'));

  it('row 6, a published version is never unpublished by the platform: `publishedVersionId` is written in a `data:` block by the two publication acts and NOWHERE else (thesis step 23)', () => {
    for (const module of PUBLICATION) sourceOf(`${module}.ts`, MODULES[module].step);
    const writers = modules()
      .filter(({ code }) => writesThePin(code))
      .map(({ file }) => file);
    expect(writers.sort()).toEqual(PUBLICATION.map((m) => `${m}.ts`).sort());
  });

  it('row 6, flags are DERIVED: no field named flagged* on ThesisMention or ThesisVersion', () => {
    const models = ['ThesisMention', 'ThesisVersion'];
    expect(models.filter((model) => blockNamed('model', model) === undefined)).toEqual([]);
    const stored = models.flatMap((model) =>
      fieldsOf(blockNamed('model', model))
        .filter((f) => /^flagged/i.test(f.name))
        .map((f) => `${model}.${f.name}`),
    );
    expect(stored).toEqual([]);
  });

  // ROW 8: NOTHING ABOVE THE CORPUS IS ANCHORED — the thesis layer's OWN list (sketch
  // §6-5), one subject at a time so each reddens by name: every module `contract.ts`
  // maps, and the model actors the thesis steps build (the debate assessor is evidence's
  // and already on `test/evidence/scans.test.ts`'s research-act list). The registry's
  // one caller is the evidence scan's, not re-spelled.
  const CHAIN = ['Web3Service', 'anchorSnapshots'];
  const reachesTheChain = (code: string): string[] =>
    importSpecifiers(code).filter((s) => CHAIN.some((c) => s === c || s.endsWith(`/${c}`)));
  const SUBJECTS: readonly (readonly [string, number])[] = [
    ...(Object.keys(MODULES) as ModulePath[]).map((m): readonly [string, number] => [`${m}.ts`, MODULES[m].step]),
    ...Object.entries(MODEL_ACTORS).filter(([, step]) => step >= 17),
  ];

  for (const [module, step] of SUBJECTS) {
    it(`row 8, ${module} imports neither Web3Service nor the anchoring module — nothing above the corpus is anchored`, () => {
      expect(reachesTheChain(sourceOf(module, step))).toEqual([]);
    });
  }

  it('DETECTS a pin written in a `data:` block and a chain import — and a `where:`, a read and a comment do not fire', () => {
    expect(writesThePin('await tx.thesis.update({ where: { id }, data: { publishedVersionId: head, publishedAt } });')).toBe(true);
    expect(writesThePin('await tx.thesis.update({ where: { id }, data: { publishedVersionId } });')).toBe(true);
    expect(writesThePin('await prisma.thesis.update({ where: { publishedVersionId: v }, data: { headVersionId } });')).toBe(false);
    expect(writesThePin('await prisma.thesis.findMany({ where: { publishedVersionId: { not: null } } });')).toBe(false);
    expect(reachesTheChain("import { Web3Service } from '../services/Web3Service';")).toEqual(['../services/Web3Service']);
    expect(reachesTheChain("import { writesAllowed } from './anchorSnapshots';")).toEqual(['./anchorSnapshots']);
    expect(reachesTheChain("import { recordId } from '../lib/evidenceIdentity';")).toEqual([]);
    expect(reachesTheChain(codeOf("// import { Web3Service } from '../services/Web3Service';\nconst x = 1;"))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// row 9, opened pages stay open — PUBLIC_PAGE's SUPERSEDED arm (thesis A3
// :1399–:1402; the R40 sketch §2's row; 7.2 round 1, Q3)
// ---------------------------------------------------------------------------

describe('row 9, opened pages stay open — the SUPERSEDED arm of PUBLIC_PAGE', () => {
  it('a page cited ONLY by a version that was published and then SUPERSEDED by a later publication citing nothing of it stays PUBLIC (thesis step 23)', async () => {
    // VERSION, citing the diff, was published (ATTEMPT). NEXT_VERSION, citing nothing,
    // was published after it and is the pin now. There is NO withdrawal — that arm is
    // the evidence suite's — so the only way this page was ever opened is a version
    // that was superseded.
    const thesis = {
      ...THESIS,
      headVersionId: NEXT_VERSION.id,
      publishedVersionId: NEXT_VERSION.id,
      publishedAt: new Date(Date.UTC(2026, 8, 10, 9, 31)),
      publishedById: AUTHOR,
    };
    store.thesis = thesis;
    store.theses = [thesis];
    store.versions = [VERSION, TRAJECTORY_VERSION, NEXT_VERSION];
    store.mentions = [mentionRow(MENTION, false), mentionRow(TRAJECTORY_MENTION, false)];
    store.attempts = [
      ATTEMPT,
      { ...ATTEMPT, id: 'attempt-of-next-version', versionId: NEXT_VERSION.id, createdAt: new Date(Date.UTC(2026, 8, 10, 9, 31)) },
    ];
    store.evidenceRows = [
      { fileHash: DIFF_NAME, kind: 'DIFF', status: 'PROMOTED', snapshot: null, urlVersionDiff: { ...DIFF_ROW, trackedUrlId: PAGE.id } },
    ];
    // THE FIXTURE, CHECKED BEFORE THE PREDICATE IS ASKED: the page's record IS cited,
    // by a version that is NOT the pin now — so a PUBLIC_PAGE that asks only for the
    // pin answers false, and the case is red on that behaviour and nothing else.
    const onThePage = { type: 'EVIDENCE', refId: { in: [DIFF_NAME] } };
    expect(await db.thesisMention.count({ where: onThePage })).toBe(1);
    expect(await db.thesisMention.count({ where: { ...onThePage, thesisVersion: { isPublished: { isNot: null } } } })).toBe(0);
    await expect(publicPage(PAGE.id)).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// A7 — the meta-case
// ---------------------------------------------------------------------------

describe("A7 — every suite name is a describe under test/thesis/ (sketch §5h)", () => {
  const THESIS_TESTS = join(BACKEND, 'test', 'thesis');
  /** Every `describe` title in a file's code — a string literal's first argument, comments stripped. */
  const describeTitles = (code: string): string[] =>
    [...code.matchAll(/\bdescribe\(\s*(['"`])(.*?)\1/g)].map((m) => m[2] ?? '');
  const titles = (): string[] =>
    tsFiles(THESIS_TESTS)
      .filter((file) => file.endsWith('.test.ts'))
      .flatMap((file) => describeTitles(readCode(file)));

  it("each of A7's EIGHT suite names is a describe title, EXACTLY — an A7 name with no test is a red (A7 :1630–:1660)", () => {
    const held = titles();
    expect(A7_SUITE_NAMES.filter((name) => !held.includes(name))).toEqual([]);
  });

  it("the NINTH, thesis-cites-verified, is EXCLUDED by name: an operational instrument run in the deployment (A7 :1621), its cases test/evidence/auditTheses.test.ts's, extended at step 24", () => {
    expect(titles()).not.toContain('thesis-cites-verified');
    expect(Object.entries(A7_EXCLUDED)).toEqual([['thesis-cites-verified', 24]]);
    expect(existsSync(join(BACKEND, 'test', 'evidence', 'auditTheses.test.ts'))).toBe(true);
  });

  it('DETECTS a describe title — and an `it` title and a commented-out describe are not one', () => {
    expect(describeTitles("describe('a-planted-name', () => {")).toEqual(['a-planted-name']);
    expect(describeTitles('describe("a-planted-name", () => {')).toEqual(['a-planted-name']);
    expect(describeTitles("it('a-planted-name holds', () => {")).toEqual([]);
    expect(describeTitles(codeOf("// describe('a-planted-name', () => {\nconst x = 1;"))).toEqual([]);
  });
});
