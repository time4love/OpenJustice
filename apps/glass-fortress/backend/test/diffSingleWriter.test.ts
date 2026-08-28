import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// A DIFF IS WRITTEN IN ONE PLACE, AND IS THE PAIR IT SPANS.
//
// `UrlVersionDiff` had NO constraint of any kind and was written from EIGHT
// `create` call sites, all in WaybackScraper.ts. So a from-scratch rescan
// duplicated every diff it re-derived — which is why Level 1's capture recovery
// needed a bespoke instrument instead of an ordinary scan.
//
// One rule, eight implementations, is this repository's dominant defect shape.
//
// WHY A SOURCE SCAN. A behaviour test covers only the paths someone thought to
// test; a ninth call site added tomorrow is covered by nothing. This fails the
// moment one appears.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, '..', 'src');

/** The one module permitted to write a diff row. */
const DIFF_WRITER = 'services/recordDiff.ts';

/**
 * Modules permitted to UPDATE existing diffs.
 *
 * Updating a row that already exists is not creating one, and these are the
 * re-derivation tools that exist to replace a classification on a diff already
 * keyed to its captures. Listed explicitly so a new one is a decision.
 */
const UPDATERS = [
  'services/backfillDiffSurvival.ts',
  'services/reclassifyDiffs.ts',
  'services/rediffFromSnapshots.ts',
  'services/resummarizeDiffs.ts',
];

function tsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsFiles(full);
    return full.endsWith('.ts') ? [full] : [];
  });
}

/** Files performing the given diff operation, comments stripped. */
function filesCalling(op: RegExp): string[] {
  return tsFiles(SRC)
    .filter((file) => {
      const code = readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => {
          const t = l.trimStart();
          return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
        })
        .join('\n');
      return op.test(code);
    })
    .map((f) => f.slice(SRC.length + 1));
}

describe('a diff row is created in exactly one place', () => {
  const creators = filesCalling(/urlVersionDiff\.(create|upsert)\s*\(/);

  it('finds a diff writer at all — a silent zero would make this vacuous', () => {
    expect(creators.length).toBeGreaterThan(0);
  });

  it('is recordDiff and nothing else', () => {
    expect(creators).toEqual([DIFF_WRITER]);
  });

  it('keys the write on the capture pair, so a rescan converges', () => {
    const source = readFileSync(join(SRC, DIFF_WRITER), 'utf8');
    // UPSERT, not create: re-deriving a diff for a pair already held is a rescan
    // doing its job, and must leave the corpus where the first run did.
    expect(source).toContain('urlVersionDiff.upsert');
    expect(source).toContain('beforeSnapshotId_afterSnapshotId');
  });
});

describe('updates to existing diffs are separate and enumerated', () => {
  it('only the re-derivation tools update diff rows', () => {
    // Updating a row keyed to its captures is not creating one. Listing them
    // means a new updater is a decision rather than a discovery.
    expect(filesCalling(/urlVersionDiff\.update\s*\(/).sort()).toEqual([...UPDATERS].sort());
  });
});

describe('the identity is declared in the schema, not only in the writer', () => {
  const schema = readFileSync(join(SRC, '..', 'prisma', 'schema.prisma'), 'utf8');
  const start = schema.indexOf('model UrlVersionDiff');
  const model = schema.slice(start, schema.indexOf('\n}', start));

  it('finds the model — a silent miss would make the rest vacuous', () => {
    expect(start).toBeGreaterThan(-1);
    expect(model.length).toBeGreaterThan(200);
  });

  it('constrains the capture pair to be unique', () => {
    expect(model).toContain('@@unique([beforeSnapshotId, afterSnapshotId])');
  });

  it('requires both captures — a diff we cannot check is not written', () => {
    // Level 5 checks a reported change against the DOCUMENTS. Without both
    // captures there are none, so the row could never be validated or promoted.
    // Measured before the constraint: 81 of 81 populated in both environments.
    expect(model).toMatch(/^\s+beforeSnapshotId\s+String\s*$/m);
    expect(model).toMatch(/^\s+afterSnapshotId\s+String\s*$/m);
  });
});
