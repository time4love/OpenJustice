import { chunksOf } from '../src/services/corpusReads';

// ---------------------------------------------------------------------------
// chunk-side-is-the-union — docs/gf-ui-refactor-plan.md :555 (the repair UI-7 carries), and the researcher's
// ruling of 2026-09-19 placing the BACKEND half of that repair in this chunk.
//
// WHAT WENT WRONG, AND WHERE THE REAL HOLE WAS. `RecordPane.tsx` compared a chunk's side against „before" —
// a word `diffChunking.ts` has never emitted — and so labelled every chunk of a cited diff „אחרי", the
// removed ones included. The FRONTEND fix (one lookup, one place) stops that spelling. It does NOT stop the
// next one, because the reason `tsc` could not see it was on THIS side of the wire: `StoredChunk.side` and
// `publishedThesis.ts`' citation shape were both `string`, so any word at all type-checked all the way out
// to the reader.
//
// SO THE GUARD IS HERE, AT THE READER OF THE COLUMN. `chunksOf` is, by its own comment, "the one reader of
// stored chunks" — every diff's content reaches a caller through it. A side outside the union is a WALK
// DEFECT in exactly the sense that function already names: it means the column holds something the walk does
// not write. It is refused BY NAME, in the same voice as the half-chunk and not-an-object arms beside it.
//
// WHY REFUSE RATHER THAN DROP. `chunksOf`' own comment is the argument, and it is unchanged by this case: a
// silently dropped chunk would change the ANSWER, not just the report — CONTRADICTED would stop refusing,
// NOTHING_TO_PROMOTE could fire on a diff that has chunks, and an assessor would be handed partial content
// as though it were all of it.
// ---------------------------------------------------------------------------

/** The shape the walk writes, whole, so a case can vary ONE field and nothing else. */
const whole = (side: string) => [{ side, text: 'הפסקה על תופעות הלוואי', survival: 'SURVIVES' }];

const PAIR = '20211223211940..20220105090000';

describe('chunk-side-is-the-union', () => {
  it('CS-1 THE FLOOR: both sides the walk writes pass through whole, and the subject set is not empty', () => {
    // A TWO-SIDED FLOOR, because the guard below is a REFUSAL and a refusal that refused everything would
    // also pass a one-sided case. Both legal values must survive, or the guard is a wall and not a filter.
    const sides = ['REMOVED', 'ADDED'];
    expect(sides.length).toBeGreaterThanOrEqual(2);
    for (const side of sides) {
      const [chunk] = chunksOf(whole(side), PAIR);
      expect(chunk?.side).toBe(side);
      expect(chunk?.text).toBe('הפסקה על תופעות הלוואי');
      expect(chunk?.survival).toBe('SURVIVES');
    }
    // eslint-disable-next-line no-console
    console.log(`chunk-side-is-the-union: ${String(sides.length)} legal sides pass through chunksOf whole: ${sides.join(' · ')}`);
  });

  it('CS-2 A SIDE OUTSIDE THE UNION IS REFUSED, and the refusal NAMES THE FIELD AND THE VALUE', () => {
    // THE VALUES ARE THE REAL ONES, not arbitrary noise: „before"/„after" are the exact words the frontend
    // had been comparing against, so this case holds the value the repair fixes and not merely the property
    // name. The empty string and a case-shifted spelling are the two near-misses a drift would produce.
    const offenders = ['before', 'after', '', 'removed', 'REMOVED ', 'DELETED'];
    expect(offenders.length).toBeGreaterThanOrEqual(3);
    for (const side of offenders) {
      expect(() => chunksOf(whole(side), PAIR)).toThrow(/side/);
      // NAMING THE VALUE is what makes the refusal diagnosable — a message that said only "bad chunk" would
      // leave an operator reading the column by hand to find out which word arrived.
      expect(() => chunksOf(whole(side), PAIR)).toThrow(new RegExp(JSON.stringify(side).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      // And the PAIR, because a defect in one diff must say which diff.
      expect(() => chunksOf(whole(side), PAIR)).toThrow(new RegExp(PAIR.replace(/\./g, '\\.')));
    }
    // eslint-disable-next-line no-console
    console.log(`chunk-side-is-the-union: ${String(offenders.length)} illegal sides refused by name, including the two the frontend had been comparing against`);
  });

  it('CS-3 THE ARMS BESIDE IT STILL REFUSE — the new guard did not displace the shape checks', () => {
    // A guard added to a function with existing refusals can quietly reorder them. These are `chunksOf`'
    // own two arms, unchanged by this chunk, asserted so that a later edit cannot trade one for the other.
    expect(() => chunksOf([{ side: 'REMOVED', text: 'x' }], PAIR)).toThrow(/HALF chunk/);
    expect(() => chunksOf(['not an object'], PAIR)).toThrow(/not an object/);
    expect(() => chunksOf('not an array', PAIR)).toThrow(/does not hold an array/);
    // `null` is the ABSENCE the column legitimately holds, and it is not a defect.
    expect(chunksOf(null, PAIR)).toEqual([]);
  });
});
