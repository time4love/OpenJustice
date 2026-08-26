import * as fs from 'fs';
import * as path from 'path';
import { diffLines } from 'diff';
import { groupDiffChunks, classifierInputChunks } from '../src/lib/diffChunking';

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
// exported groupDiffChunks/classifierInputChunks output — never hand-edit the
// expected JSON, since it exists to catch unintended changes to the diff pipeline.
//
// THIS PAIR IS ONE OF THE SIX DIFFS THE OLD CAP TRUNCATED.
//
// The expected JSON previously recorded 8 deletions and 8 additions, because
// MAX_CHUNKS_PER_SIDE discarded the rest before they were ever written. The real
// change is 34 and 34. The fixture has been regenerated from the current
// pipeline, and the counts are asserted explicitly below so that reintroducing a
// cap fails here against real page text rather than only against a synthetic
// case. See docs/gf-diff-truncation-dev-plan.md.
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
    const raw = diffLines(before, after, { ignoreWhitespace: true });

    expect(groupDiffChunks(raw, 'removed')).toEqual(expected.deletions);
    expect(groupDiffChunks(raw, 'added')).toEqual(expected.additions);
  });

  it('keeps all 34 changes per side — the cap kept 8', () => {
    const raw = diffLines(before, after, { ignoreWhitespace: true });

    // Hard-coded on purpose. This is the measured truth for this real page
    // change, and the number the old pipeline reported was 8.
    expect(groupDiffChunks(raw, 'removed')).toHaveLength(34);
    expect(groupDiffChunks(raw, 'added')).toHaveLength(34);
  });

  it('sends every stored chunk to the classifier, including short ones', () => {
    const raw = diffLines(before, after, { ignoreWhitespace: true });
    const deletions = groupDiffChunks(raw, 'removed');
    const additions = groupDiffChunks(raw, 'added');

    expect(classifierInputChunks(deletions)).toEqual(expected.classifierInputDeletions);
    expect(classifierInputChunks(additions)).toEqual(expected.classifierInputAdditions);
    // Nothing is withheld from the model any more.
    expect(classifierInputChunks(deletions)).toEqual(deletions);
    expect(classifierInputChunks(additions)).toEqual(additions);
  });

  it('carries chunks far below the old 40-character floor', () => {
    const raw = diffLines(before, after, { ignoreWhitespace: true });
    const all = [...groupDiffChunks(raw, 'removed'), ...groupDiffChunks(raw, 'added')];

    // The shortest real chunk in this pair is 8 characters. Under the old rule it
    // was neither stored nor shown to a classifier — and short structural edits
    // are exactly the class this archive exists to document.
    const shortest = Math.min(...all.map((c) => c.length));
    expect(shortest).toBeLessThan(40);
    expect(classifierInputChunks(all)).toContain(all.find((c) => c.length === shortest));
  });

  it('is directional — swapping before/after does not reproduce the same result', () => {
    // Guards against a reversed-comparison regression: on real, substantially
    // different content, diffing backwards must not coincidentally produce
    // the same deletions/additions.
    const reversedRaw = diffLines(after, before, { ignoreWhitespace: true });

    expect(groupDiffChunks(reversedRaw, 'removed')).toEqual(expected.additions);
    expect(groupDiffChunks(reversedRaw, 'added')).toEqual(expected.deletions);
  });
});
