import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// THE EXTERNAL AXIS MUST ASK THE ARCHIVE. It may not read our record of what the
// Archive once said.
//
// Level 1's completion criterion is `sha1b32(document) == cdx.digest`, and its
// entire value is that the right-hand side comes from OUTSIDE this platform. The
// level was reopened twice for self-referential verification — a derivative
// stored under the name of the original, checked against itself — and closed only
// when an external witness was introduced.
//
// Storing the CDX digest (CdxIndexEntry.digest) reintroduces the temptation in
// its most persuasive form: A PERFORMANCE OPTIMISATION. The live CDX query is the
// slow part of verification, and the plan's own wording invited it by describing
// the digest as "currently re-fetched on every verification" — framing the fetch
// as a cost rather than as the point. Reading the stored digest instead would
// turn the external axis into a second internal check (our bytes against our own
// note) while every count stayed green.
//
// A COMMENT SAYING "DO NOT DO THIS" IS NOT A CONTROL. This project has now found
// comments doing a constraint's job four times. So the constraint is: the files
// that observe the Archive live must not reference the stored-observation models
// at all — they cannot read what they cannot name.
//
// TWO-SIDED, DELIBERATELY. A negative assertion alone is satisfied by a file that
// checks nothing whatsoever: delete the CDX fetch entirely and "does not read
// stored observations" passes. So each file must ALSO be shown to issue a live
// request. Same lesson as the vacuity guard — an assertion that cannot fail, and
// an assertion satisfied by absence, are the same family.
// ---------------------------------------------------------------------------

const SRC = join(__dirname, '..', 'src');

/**
 * Files whose whole purpose is to observe the Archive AS IT IS NOW.
 *
 * `verifyAgainstCdx` computes Level 1's completion criterion.
 * `archiveVerification` backs `list_captures`, which deliberately queries CDX
 * live and un-collapsed so a researcher sees what the Archive holds rather than
 * what we recorded.
 */
const LIVE_OBSERVERS = [
  'services/verifyAgainstCdx.ts',
  'services/archiveVerification.ts',
] as const;

/** Prisma accessors for the stored-observation models. */
const STORED_OBSERVATION_MODELS = ['cdxIndexEntry', 'cdxQuery', 'CdxIndexEntry', 'CdxQuery'];

function read(rel: string): string {
  return readFileSync(join(SRC, rel), 'utf8');
}

describe('live Archive observers ask the Archive and never read our record of it', () => {
  it.each(LIVE_OBSERVERS)('%s issues a LIVE CDX request', (rel) => {
    const source = read(rel);
    // Positive half. Without it, deleting the fetch would satisfy the negative
    // assertion below and the criterion would silently stop being external.
    expect(source).toMatch(/web\.archive\.org\/cdx\/search\/cdx/);
    expect(source).toMatch(/axios\.get/);
  });

  it.each(LIVE_OBSERVERS)('%s does not reference any stored-observation model', (rel) => {
    const source = read(rel);
    for (const model of STORED_OBSERVATION_MODELS) {
      expect(source).not.toContain(model);
    }
  });

  it('levelOneComplete is computed in exactly one place, and that place is a live observer', () => {
    // If a second file ever computes the criterion, it inherits none of the
    // constraints above unless it is added to LIVE_OBSERVERS deliberately.
    const files = sourceFilesContaining('levelOneComplete');
    expect(files.length).toBeGreaterThan(0); // vacuity guard
    for (const file of files) {
      expect(LIVE_OBSERVERS as readonly string[]).toContain(file);
    }
  });
});

/** Every src file mentioning `needle`, as a path relative to src/. */
function sourceFilesContaining(needle: string): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
    });
  return walk(SRC)
    .filter((f) => readFileSync(f, 'utf8').includes(needle))
    .map((f) => f.slice(SRC.length + 1));
}


// ---------------------------------------------------------------------------
// The CDX digest must not acquire a home on UrlSnapshot.
//
// Duplicating it there would put a CDX-SUPPLIED hash in the same row as
// `documentHash`, and this repository has already paid for two hash-shaped
// columns of different provenance sitting together: a base32 SHA-1 was written
// into `documentHash`, a SHA-256 column, and stayed there across BOTH
// environments until an external check caught it.
//
// documentHashSingleRule.test.ts would not catch this one — it asserts what
// WRITES to documentHash, not what sits beside it. The later "optimisation" of
// denormalising the digest to save a join therefore has to fail loudly here, or
// it will look sensible to whoever proposes it.
// ---------------------------------------------------------------------------
describe('the CDX digest lives on CdxIndexEntry, never beside documentHash', () => {
  it('UrlSnapshot has no cdx-shaped column', () => {
    const schema = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8');
    const start = schema.indexOf('model UrlSnapshot {');
    expect(start).toBeGreaterThan(-1); // vacuity guard: the model must exist
    const model = schema.slice(start, schema.indexOf('\n}', start));

    const scalarFields = [...model.matchAll(/^\s{2}(\w+)\s+(String|Bytes|Int|DateTime|Boolean)/gm)]
      .map((m) => m[1] ?? '');
    expect(scalarFields.length).toBeGreaterThan(0); // vacuity guard
    expect(scalarFields.filter((f) => /cdx/i.test(f))).toEqual([]);
  });
});
