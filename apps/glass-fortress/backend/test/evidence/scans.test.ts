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

describe('every predicate of A3 has ONE importable symbol', () => {
  // "A source scan that fails on a second spelling of VERIFIED, CURRENT or
  // PUBLISHABLE" — the publication gate CALLS the predicates and never
  // re-derives them, because a second spelling inside the gate is the copy that
  // drifts. The predicate and the gate are one implementation.
  const SPELLINGS = [
    /function\s+verified\s*\(/,
    /function\s+publishable\s*\(/,
    /function\s+currentVersionOf\s*\(/,
  ];

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
});
