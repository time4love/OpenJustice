import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  classificationInputState,
  classificationInputView,
} from '../src/lib/classificationProvenance';

// ---------------------------------------------------------------------------
// A VERSION FOR THE PROCEDURE IS NOT A VERSION FOR WHAT THE PROCEDURE WAS FED.
//
// `applyRediff` rewrites a diff's chunks and updates `diffInputVersion`,
// deliberately leaving the classification alone so that "chunks current,
// classification not" is visible in the data. It was not visible. The
// granularity cascade rewrote chunks v2 -> v3 on ten rows whose
// `classifierVersion` was ALREADY `v4-budgeted-best-of-n` — so it stayed v4,
// nothing moved, and those rows came to assert a pairing that never happened: a
// v4 classification over v3 chunks, when the v4 run had read v2 chunks that no
// longer exist. Seven CONFIRMED, anchored records sit downstream.
//
// The first case below is that exact row, and it is the one that would have
// caught the cascade.
// ---------------------------------------------------------------------------

const V2 = 'v2-longest-first';
const V3 = 'v3-sentence-claims';
const V4 = 'v4-budgeted-best-of-n';

describe('does the classification describe the chunks the row now holds', () => {
  it('the cascaded row is STALE, even though its classifier version never moved', () => {
    // THE TEN ROWS. Every other provenance field on this row reads as current.
    const state = classificationInputState({
      classifierVersion: V4,
      diffInputVersion: V3,
      classifiedInputVersion: V2,
    });
    expect(state).toBe('STALE');
  });

  it('names both versions, so the reader does not have to look them up', () => {
    const view = classificationInputView({
      classifierVersion: V4,
      diffInputVersion: V3,
      classifiedInputVersion: V2,
    });
    expect(view.caveat).toContain(V2);
    expect(view.caveat).toContain(V3);
  });

  it('says reclassifying is a RESEARCH decision, not a repair', () => {
    // The caveat is read by someone deciding what to do next, and the wrong next
    // step here changes what the record says about the ministry's edit.
    const view = classificationInputView({
      classifierVersion: V4,
      diffInputVersion: V3,
      classifiedInputVersion: V2,
    });
    expect(view.caveat).toContain('RESEARCH decision');
  });

  it('a classification over the chunks the row holds is CURRENT', () => {
    expect(
      classificationInputState({
        classifierVersion: V4,
        diffInputVersion: V3,
        classifiedInputVersion: V3,
      }),
    ).toBe('CURRENT');
  });

  it('an unclassified row is UNCLASSIFIED — there is no claim to be stale', () => {
    expect(
      classificationInputState({
        classifierVersion: null,
        diffInputVersion: V3,
        classifiedInputVersion: null,
      }),
    ).toBe('UNCLASSIFIED');
  });

  // -------------------------------------------------------------------------
  // UNRECORDED IS ITS OWN ANSWER, and does not collapse into either neighbour —
  // the same reasoning that keeps UNAVAILABLE out of VERIFIED and CONTRADICTED
  // one level up. Calling it current claims something nothing supports; calling
  // it stale claims something nothing supports either.
  // -------------------------------------------------------------------------
  it('a row predating the column is UNRECORDED, not CURRENT', () => {
    expect(
      classificationInputState({
        classifierVersion: V4,
        diffInputVersion: V3,
        classifiedInputVersion: null,
      }),
    ).toBe('UNRECORDED');
  });

  it('UNRECORDED says it is evidence of neither', () => {
    const view = classificationInputView({
      classifierVersion: V4,
      diffInputVersion: V3,
      classifiedInputVersion: null,
    });
    expect(view.caveat).toContain('not evidence');
    // And says why it is not quietly backfilled — writing diffInputVersion in
    // would assert exactly the pairing the ten rows were caught asserting.
    expect(view.caveat).toContain('NOT backfilled');
  });

  it('a row with no diffInputVersion either is still not CURRENT', () => {
    // Both null would compare equal, which is the one shape that could report a
    // row that predates every input rule as though its classification were
    // verified against one.
    expect(
      classificationInputState({
        classifierVersion: V4,
        diffInputVersion: null,
        classifiedInputVersion: null,
      }),
    ).toBe('UNRECORDED');
  });
});

// ---------------------------------------------------------------------------
// A SOURCE SCAN, because this is a pairing and pairings drift.
//
// Four call sites write `classifierVersion` today — two on the scan path, two on
// the reclassification path. One of them forgetting `classifiedInputVersion`
// recreates the defect exactly: a classification whose input provenance is
// silently absent reads as UNRECORDED forever, which is not a pass but is also
// not the loud failure a missing stamp deserves. "One rule, many
// implementations" is this repository's dominant defect shape.
// ---------------------------------------------------------------------------
describe('every writer of a classification records what it read', () => {
  const SRC = join(__dirname, '..', 'src');

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      if (e.isDirectory()) return walk(path);
      return e.name.endsWith('.ts') ? [path] : [];
    });
  }

  /**
   * Prisma writes that set classifierVersion, each with the REST OF ITS OWN
   * STATEMENT — everything up to the `});` that closes the write. A stamp placed
   * in a different update would leave a window in which the two disagree, and
   * cutting the window off at the statement boundary is what rules that out.
   */
  const writes = walk(SRC).flatMap((path) => {
    const lines = readFileSync(path, 'utf8').split('\n');
    return lines.flatMap((line, i) => {
      if (!line.includes('classifierVersion: CLASSIFIER_VERSION,')) return [];
      const rest: string[] = [];
      for (const following of lines.slice(i + 1)) {
        if (following.includes('});')) break;
        rest.push(following);
      }
      return [{ path, statement: rest.join('\n') }];
    });
  });

  it('finds the write sites at all — a silent zero would make this vacuous', () => {
    // Four at the time of writing: two in WaybackScraper, two in reclassifyDiffs.
    expect(writes.length).toBeGreaterThanOrEqual(4);
  });

  it.each(writes.map((w, i) => [`${w.path}#${String(i)}`, w] as const))(
    '%s stamps classifiedInputVersion in the same statement',
    (_label, write) => {
      expect(write.statement).toContain('classifiedInputVersion:');
    },
  );
});
