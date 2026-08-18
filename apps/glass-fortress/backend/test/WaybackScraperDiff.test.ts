import * as fs from 'fs';
import * as path from 'path';
import { diffLines } from 'diff';
import { groupDiffChunks, chunksForAI } from '../src/lib/diffChunking';

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
// exported groupDiffChunks/chunksForAI output — never hand-edit the expected
// JSON, since it exists to catch unintended changes to the diff pipeline.
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, 'fixtures');

function readFixture(name: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf-8');
}

describe('WaybackScraper diff pipeline — real snapshot regression', () => {
  const before = readFixture('wayback-vaccine-2022-09-05.txt');
  const after = readFixture('wayback-vaccine-2022-09-06.txt');
  const expected = JSON.parse(
    readFixture('wayback-vaccine-2022-09-05-to-06-expected.json'),
  ) as {
    deletions: string[];
    additions: string[];
    deletionsForAI: string[];
    additionsForAI: string[];
  };

  it('reproduces the exact deletion/addition chunks from the real page change', () => {
    const raw = diffLines(before, after, { ignoreWhitespace: true });
    const deletions = groupDiffChunks(raw, 'removed');
    const additions = groupDiffChunks(raw, 'added');

    expect(deletions).toEqual(expected.deletions);
    expect(additions).toEqual(expected.additions);
  });

  it('reproduces the AI-eligible subset (chunks >= MIN_CHUNK_LENGTH)', () => {
    const raw = diffLines(before, after, { ignoreWhitespace: true });
    const deletions = groupDiffChunks(raw, 'removed');
    const additions = groupDiffChunks(raw, 'added');

    expect(chunksForAI(deletions)).toEqual(expected.deletionsForAI);
    expect(chunksForAI(additions)).toEqual(expected.additionsForAI);
  });

  it('is directional — swapping before/after does not reproduce the same result', () => {
    // Guards against a reversed-comparison regression: on real, substantially
    // different content, diffing backwards must not coincidentally produce
    // the same deletions/additions.
    const reversedRaw = diffLines(after, before, { ignoreWhitespace: true });
    const reversedDeletions = groupDiffChunks(reversedRaw, 'removed');
    const reversedAdditions = groupDiffChunks(reversedRaw, 'added');

    expect(reversedDeletions).toEqual(expected.additions);
    expect(reversedAdditions).toEqual(expected.deletions);
  });
});
