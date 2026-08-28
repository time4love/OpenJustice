import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// EVERY SURFACE THAT SHOWS A DIFF SHOWS ITS VERDICT.
//
// WHY A SOURCE SCAN, and not a response test. The clients declare their own
// interfaces by hand rather than deriving them from the API, so a surface that
// omits `survival` COMPILES, ships, and renders a diff with no verdict on it —
// which looks exactly like a diff that passed. The type system cannot see this
// class of omission, and a behaviour test covers only the endpoints someone
// thought to write one for.
//
// There were EIGHT such surfaces across seven modules when this was written, and
// each built its own record by hand:
//
//   forensicsRoutes         — scan status, paged history, and the HTML report
//   evidenceRoutes          — the diff a promoted, possibly ANCHORED record rests on
//   getForensicTimeline     — the MCP timeline the researcher reads
//   getScanFindings         — THE PROMOTION QUEUE
//   getDiffInput            — the raw chunks the check itself evaluates
//   previewDiffClassification — what a newer classifier would say
//   diffDebate              — the argument about whether to promote
//
// Level 2's admission gate was present on the path the website used and absent
// from the three the researcher used. This fails the moment a ninth appears.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, '..', 'src');

/** Modules that read a stored diff in order to show it to somebody. */
const EXPECTED_SURFACES = [
  'mcp/tools/getForensicTimeline.ts',
  'mcp/tools/getScanFindings.ts',
  'routes/evidenceRoutes.ts',
  'routes/forensicsRoutes.ts',
  'services/diffDebate.ts',
  'services/diffInput.ts',
  'services/previewDiffClassification.ts',
];

/**
 * Readers that are exempt, each with its reason.
 *
 * A list with reasons attached, rather than a narrower detector: a detector that
 * quietly skipped these would also quietly skip the next surface that happened
 * to resemble them.
 */
const EXEMPT: Record<string, string> = {
  // Producers, not readers: they WRITE the significance rather than present it.
  'lib/classifierVersion.ts': 'names the field in prose; queries nothing',
  'prompts/forensicDiffClassification.ts': 'the schema the model fills in, not a view of a stored row',
  'services/ForensicAgent.ts': 'produces the classification; there is no stored verdict yet',
  'services/WaybackScraper.ts': 'writes diffs through recordDiff, which computes the verdict',

  // A maintenance script's console output, not a surface anyone decides from —
  // and it rewrites summaries rather than presenting the change for judgement.
  'services/resummarizeDiffs.ts': 'maintenance tool, rewrites summaries, shows nobody a diff',
  'services/reclassifyDiffs.ts': 'maintenance tool, replaces a classification, shows nobody a diff',

  // OPEN FINDING, RECORDED HERE RATHER THAN IN A COMMENT NOBODY READS.
  //
  // These two are the PROMOTION PATHS, and Level 5 says a CONTRADICTED diff is
  // "never promotable" — but nothing in this codebase enforces that. The plan
  // asserts the property; the code does not have it. They are exempted from the
  // DISPLAY rule because they display nothing, and naming them here is what
  // stops the exemption from reading as "nothing to do".
  'services/forensicEvidence.ts':
    'promotion path, not a display surface — the CONTRADICTED gate is NOT implemented here',
  'services/promoteForensicDiff.ts':
    'promotion path, not a display surface — the CONTRADICTED gate is NOT implemented here',
};

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

/**
 * Every file that touches a diff's model-written significance, minus exemptions.
 *
 * DELIBERATELY THE BROADEST DETECTOR, narrowed only by a written list. Two
 * narrower rules were tried and both had holes: matching the output key also
 * caught the producers, and matching `aiSignificance: true` — the Prisma select —
 * MISSED `previewDiffClassification` and `getDiffInput` entirely, because they
 * load the row with `include` and never name the column. A detector that decides
 * for itself what counts as a surface will quietly keep missing the next one.
 *
 * So the rule is: anything that touches the field is a surface until someone
 * writes down why it is not. That makes every exclusion auditable, and it makes
 * adding a ninth surface fail loudly instead of passing silently.
 */
function diffSurfaces(): string[] {
  return tsFiles(SRC)
    .filter((file) => readFileSync(file, 'utf8').includes('aiSignificance'))
    .map((f) => f.slice(SRC.length + 1))
    .filter((f) => !(f in EXEMPT))
    .sort();
}

describe('a diff is never shown without its Level 5 verdict', () => {
  const surfaces = diffSurfaces();

  it('finds diff surfaces at all — a silent zero would make this vacuous', () => {
    expect(surfaces.length).toBeGreaterThan(0);
  });

  it('knows every module that renders a diff, so a new one is a decision', () => {
    expect(surfaces).toEqual(EXPECTED_SURFACES);
  });

  it.each(EXPECTED_SURFACES)('%s attaches the verdict via the shared view', (file) => {
    const source = read(file);
    // The SHARED helper specifically. A surface that hand-rolled its own mapping
    // from the stored columns would be a second definition of what UNCHECKED
    // means, and the two would drift — this repository's dominant defect shape.
    expect(source).toContain('diffSurvivalView(');
  });

  it('every exemption carries a written reason', () => {
    // An exemption list whose entries are bare filenames is a list nobody can
    // audit later. Empty strings are the failure mode being blocked.
    for (const [file, reason] of Object.entries(EXEMPT)) {
      expect(reason.length).toBeGreaterThan(20);
      expect(() => read(file)).not.toThrow(); // and it must still exist
    }
  });
});

describe('the summary carries it too, not only the rows', () => {
  it('the MCP timeline reports contradicted and unchecked counts', () => {
    // A per-row field that nothing aggregates is a field a reader skims past —
    // six recorded occasions here of the mechanism being right and the summary
    // being what people acted on.
    const source = read('mcp/tools/getForensicTimeline.ts');
    expect(source).toContain('contradictedDiffs');
    expect(source).toContain('uncheckedDiffs');
    expect(source).toContain('survivalWarning');
    expect(source).toContain('uncheckedWarning');
  });

  it('never folds the two into one number', () => {
    // A diff nobody checked and a diff the documents refute are different
    // problems with different remedies. One combined "problem diffs" count would
    // let the second hide inside the first.
    const source = read('mcp/tools/getForensicTimeline.ts');
    expect(source).not.toMatch(/contradictedDiffs\s*\+\s*uncheckedDiffs/);
  });
});
