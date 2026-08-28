import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// A CONTRADICTED DIFF IS NEVER PROMOTABLE — ON EVERY PATH, NOT THE REMEMBERED ONE.
//
// Level 5's own words. Until this test the property was a sentence in a plan:
// the check ran, the verdict was stored and displayed, and nothing stopped a
// refuted change from being promoted and anchored.
//
// WHY THIS IS A SOURCE SCAN. This is the THIRD instance in a week of the same
// shape — a rule present on the path someone thought of and absent from the
// rest — and both earlier resolutions were the same: enumerate the paths, then
// guard with a source scan. Level 2's admission gate covered one path of four.
//
// THE ENUMERATION WAS WRONG WHEN IT WAS FIRST WRITTEN, WHICH IS THE POINT.
// The count started as "three promotion paths", naming `forensicEvidence.ts`
// (a BUILDER, which is not an admission point at all) and missing
// `evidenceRoutes` entirely. `evidenceRoutes` writes status CONFIRMED with an
// on-chain tx hash — the most expensive version of this mistake.
//
// It hid the same way `getDiffInput` hid from the display scan: grepping
// `urlVersionDiffId` finds the paths that NAME the field and misses the ones
// that delegate it to `buildForensicEvidence`, which sets it itself. So this
// scan enumerates by what a path WRITES — `prisma.evidence.create` /
// `.upsert` — which is the thing that cannot be delegated away.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, '..', 'src');

/**
 * Every module that creates an `Evidence` row, and what it is.
 *
 * GATED means it turns a diff into evidence and must consult the Level 5
 * verdict. The others are here so that a new one is a decision: an entry added
 * to this map is somebody writing down what a path does, and a path absent from
 * it fails the test.
 */
const EVIDENCE_WRITERS: Record<string, { gated: boolean; why: string }> = {
  // --- creates evidence FROM A DIFF, and promotes it ---
  'services/promoteForensicDiff.ts': {
    gated: true,
    why: 'registers on chain and writes CONFIRMED — the classic promotion path',
  },
  'routes/evidenceRoutes.ts': {
    gated: true,
    why: 'writes CONFIRMED with an onChainTxHash; was missing from the first enumeration',
  },

  // --- creates evidence from a diff, but NOT a promotion ---
  'services/WaybackScraper.ts': {
    gated: false,
    why:
      'writes a PENDING_REVIEW candidate awaiting a person, which is not a promotion. Refusing to ' +
      'record it would remove the contradicted diff from the promotion queue and with it the ' +
      'warning saying why it must not be promoted — the platform would go quiet about its own defect.',
  },

  // --- creates evidence that has no diff at all ---
  'mcp/tools/createEvidenceFromText.ts': { gated: false, why: 'no diff involved; text submission' },
  'mcp/tools/createEvidenceFromUrl.ts': { gated: false, why: 'no diff involved; live URL capture' },
  'lib/persistScreenshotEvidence.ts': { gated: false, why: 'no diff involved; screenshot recovery' },
  'routes/thesisRoutes.ts': { gated: false, why: 'no diff involved; thesis gap resolution' },
};

/**
 * Modules that BUILD an evidence object without creating a row.
 *
 * `forensicEvidence.ts` was originally listed as an ungated promotion path with
 * the note "the CONTRADICTED gate is NOT implemented here". That described a gap
 * that does not exist and hid the question of where the real ones were: it
 * exports `buildForensicEvidence` and `forensicEvidenceFileHash`, and a gate
 * inside a builder would fire wherever the object is merely hashed. GATE THE
 * CALLERS — which is what EVIDENCE_WRITERS above enumerates.
 */
const BUILDERS = ['services/forensicEvidence.ts'];

/** The one function every gated path must consult. */
const GATE = /promotionBlockFor\(|loadPromotionBlock\(/;

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

function read(file: string): string {
  return readFileSync(join(SRC, file), 'utf8');
}

/** Files that actually write an Evidence row — by the write, not by a mention. */
function evidenceWriters(): string[] {
  return tsFiles(SRC)
    .filter((file) => /prisma\.evidence\.(create|upsert)\s*\(/.test(readFileSync(file, 'utf8')))
    .map((f) => f.slice(SRC.length + 1))
    .sort();
}

describe('every path that creates evidence is enumerated', () => {
  const writers = evidenceWriters();

  it('finds evidence writers at all — a silent zero would make this vacuous', () => {
    expect(writers.length).toBeGreaterThan(0);
  });

  it('knows every one of them, so a new path is a decision', () => {
    expect(writers).toEqual(Object.keys(EVIDENCE_WRITERS).sort());
  });

  it('every entry says what it is, gated or not', () => {
    for (const [file, entry] of Object.entries(EVIDENCE_WRITERS)) {
      expect(entry.why.length).toBeGreaterThan(20);
      expect(() => read(file)).not.toThrow();
    }
  });
});

describe('a CONTRADICTED diff cannot be promoted on any gated path', () => {
  const gated = Object.entries(EVIDENCE_WRITERS)
    .filter(([, e]) => e.gated)
    .map(([file]) => file);

  it('there IS more than one gated path — one would mean the enumeration failed again', () => {
    // The failure this whole test exists for is a gate on a single remembered
    // path. If this ever drops to one, either a path was deleted or somebody
    // narrowed the list to match the code.
    expect(gated.length).toBeGreaterThan(1);
  });

  it.each(gated)('%s consults the Level 5 verdict before writing', (file) => {
    expect(read(file)).toMatch(GATE);
  });

  it.each(gated)('%s uses the SHARED rule, never its own phrasing', (file) => {
    const source = read(file);
    // Three phrasings of one rule are three rules the first time anybody edits
    // one. The refusal text lives in auditDiffSurvival and nowhere else.
    expect(source).not.toContain('is still present in the after capture');
  });

  it('the debate uses the same rule rather than a fourth copy', () => {
    const source = read('services/diffDebate.ts');
    expect(source).toMatch(GATE);
    expect(source).not.toContain('is still present in the after capture');
  });
});

describe('builders are not admission points', () => {
  it.each(BUILDERS)('%s writes no evidence row', (file) => {
    // If a builder ever starts writing, it becomes an admission point and the
    // enumeration above must account for it — this is what says so.
    expect(read(file)).not.toMatch(/prisma\.evidence\.(create|upsert)\s*\(/);
  });

  it('the ungated writer is ungated on purpose, and says why at length', () => {
    // WaybackScraper is the one place that creates diff-backed evidence without
    // consulting the verdict. That is a decision, and a decision needs a reason
    // long enough to have been thought about.
    const scanner = EVIDENCE_WRITERS['services/WaybackScraper.ts'];
    expect(scanner?.gated).toBe(false);
    expect(scanner?.why.length).toBeGreaterThan(120);
    expect(scanner?.why).toContain('PENDING_REVIEW');
  });
});
