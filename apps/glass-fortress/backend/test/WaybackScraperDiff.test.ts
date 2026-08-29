import * as fs from 'fs';
import * as path from 'path';
import { diffChunkPair, classifierInputChunks } from '../src/lib/diffChunking';
import { checkDiffSurvival } from '../src/lib/diffSurvival';

// ---------------------------------------------------------------------------
// Regression test against two REAL Wayback snapshots of the same page, one
// day apart:
//   before: https://web.archive.org/web/20220905111109/https://corona.health.gov.il/vaccine-for-covid/
//   after:  https://web.archive.org/web/20220906232435/https://corona.health.gov.il/vaccine-for-covid/
//
// Fixture text was captured once via WaybackScraper.scrapeSnapshot() against
// the live URLs above (Readability + htmlToText + normaliseText — the exact
// extraction path processJob() uses), then frozen to disk so this test never
// touches the network or archive.org's availability. To refresh the fixtures
// against a different real snapshot pair, re-run that extraction once and
// regenerate wayback-vaccine-2022-09-05-to-06-expected.json from the actual
// exported diffChunkPair/classifierInputChunks output — never hand-edit the
// expected JSON, since it exists to catch unintended changes to the diff pipeline.
//
// THIS PAIR IS ONE OF THE SIX DIFFS THE OLD CAP TRUNCATED.
//
// The expected JSON once recorded 8 deletions and 8 additions, because
// MAX_CHUNKS_PER_SIDE discarded the rest before they were ever written. Removing
// the cap made it 34 and 34. Sentence-granular claims (DIFF_INPUT_VERSION
// v3-sentence-claims) make it 50 and 68: the same changes, described at the
// granularity Level 5 checks them at, so a chunk stored as REMOVED no longer
// carries unchanged sentences along with it.
//
// The two sides are no longer equal, and that is correct rather than suspicious:
// one removed sentence can be replaced by three, and a block-granular count hid
// that behind one chunk per side.
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

describe('WaybackScraper diff pipeline — real snapshot regression', () => {
  const before = readFixture('wayback-vaccine-2022-09-05.txt');
  const after = readFixture('wayback-vaccine-2022-09-06.txt');
  const expected = JSON.parse(readFixture('wayback-vaccine-2022-09-05-to-06-expected.json')) as {
    deletions: string[];
    additions: string[];
    classifierInputDeletions: string[];
    classifierInputAdditions: string[];
  };

  it('reproduces the exact deletion/addition chunks from the real page change', () => {
    const { removed, added } = diffChunkPair(before, after);

    expect(removed).toEqual(expected.deletions);
    expect(added).toEqual(expected.additions);
  });

  it('keeps every change — the cap kept 8 per side', () => {
    const { removed, added } = diffChunkPair(before, after);

    // Hard-coded on purpose. This is the measured truth for this real page
    // change; the old pipeline reported 8.
    expect(removed).toHaveLength(50);
    expect(added).toHaveLength(68);
  });

  it('sends every stored chunk to the classifier, including short ones', () => {
    const { removed, added } = diffChunkPair(before, after);

    expect(classifierInputChunks(removed)).toEqual(expected.classifierInputDeletions);
    expect(classifierInputChunks(added)).toEqual(expected.classifierInputAdditions);
    // Nothing is withheld from the model any more.
    expect(classifierInputChunks(removed)).toEqual(removed);
    expect(classifierInputChunks(added)).toEqual(added);
  });

  it('carries chunks far below the old 40-character floor', () => {
    const { removed, added } = diffChunkPair(before, after);
    const all = [...removed, ...added];

    // Under the old rule a chunk this short was neither stored nor shown to a
    // classifier — and short structural edits are exactly the class this
    // archive exists to document.
    const shortest = Math.min(...all.map((c) => c.length));
    expect(shortest).toBeLessThan(40);
    expect(classifierInputChunks(all)).toContain(all.find((c) => c.length === shortest));
  });

  it('is directional — swapping before/after does not reproduce the same result', () => {
    // Guards against a reversed-comparison regression: on real, substantially
    // different content, diffing backwards must not coincidentally produce
    // the same deletions/additions.
    const reversed = diffChunkPair(after, before);

    expect(reversed.removed).toEqual(expected.additions);
    expect(reversed.added).toEqual(expected.deletions);
  });

  it('claims nothing at a granularity coarser than the change itself', () => {
    // THE RIDER PROPERTY, on real page text.
    //
    // The old pipeline emitted a whole paragraph as REMOVED when a few words
    // inside it changed, so unchanged sentences were stored inside a removal
    // claim. No chunk may now contain a sentence that survives verbatim in the
    // counterpart region.
    const { removed, added } = diffChunkPair(before, after);
    const overlap = removed.filter((r) => added.some((a) => a === r));

    expect(overlap).toEqual([]);
  });

  it('does NOT claim to fix relocation, and this pair proves it', () => {
    // ONE CONTRADICTION SURVIVES, AND IT IS A MOVE — a sentence that left one
    // place on the page and appears in another. A positional diff reports that
    // as a removal plus an addition, and no granularity or view change alters
    // it; the remaining fix is a MOVED category, which is a separate decision.
    //
    // ASSERTED RATHER THAN LEFT UNSAID so that nobody drives this count to zero
    // by widening `segmentsOf`. That would silence the detector while the record
    // went on asserting a deletion that never happened — and it would look like
    // progress. If this test starts failing because the count reached zero, the
    // question to ask is WHICH rule changed, not whether to update the number.
    const { removed, added } = diffChunkPair(before, after);
    const result = checkDiffSurvival({
      rawDeletedText: JSON.stringify(removed),
      rawAddedText: JSON.stringify(added),
      beforeText: before,
      afterText: after,
      beforeVersion: 'fixture',
      afterVersion: 'fixture',
    });

    expect(result.verdict).toBe('CONTRADICTED');
    expect(result.contradicted).toHaveLength(1);
    expect(result.contradicted[0].side).toBe('REMOVED');
    // The moved sentence, verbatim: "Israeli citizens aged six months and over
    // may be vaccinated against the coronavirus."
    expect(result.contradicted[0].excerpt).toContain('אזרחי ישראל מגיל חצי שנה ומעלה');
  });
});
