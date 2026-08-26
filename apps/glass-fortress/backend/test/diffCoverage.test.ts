import { computeDiffCoverage } from '../src/lib/diffCoverage';
import { type DiffItem } from '../src/services/ForensicAgent';

// ---------------------------------------------------------------------------
// The metric that an earlier attempt got wrong.
//
// Comparing item COUNT to chunk COUNT reported "33% undescribed" on a corpus that
// was 91% described, because the classifier merges consecutive chunks into single
// passages. The first test below is the case that broke it.
// ---------------------------------------------------------------------------

function item(exactQuote: string): DiffItem {
  return { summary: 's', exactQuote, investigativeCategories: [], relocated: false };
}

describe('computeDiffCoverage — merging is not loss', () => {
  it('counts every chunk a single merged item covers', () => {
    const chunks = ['first sentence here', 'second sentence here', 'third sentence here'];
    const merged = item('first sentence here second sentence here third sentence here');

    const c = computeDiffCoverage({
      rawDeletedChunks: chunks,
      rawAddedChunks: [],
      deletedItems: [merged],
      addedItems: [],
    });

    // ONE item, THREE chunks, full coverage. Counting items would report 67% loss.
    expect(c.coveredChunks).toBe(3);
    expect(c.chunkCount).toBe(3);
    expect(c.complete).toBe(true);
    expect(c.chunkRatio).toBe(1);
  });

  it('counts a chunk that contains the item quote, not only the reverse', () => {
    const c = computeDiffCoverage({
      rawDeletedChunks: ['a long chunk of page text with a quoted fragment inside it'],
      rawAddedChunks: [],
      deletedItems: [item('a quoted fragment')],
      addedItems: [],
    });

    expect(c.complete).toBe(true);
  });

  it('ignores whitespace differences from the JSON round trip', () => {
    const c = computeDiffCoverage({
      rawDeletedChunks: ['some   text\n  with  odd spacing'],
      rawAddedChunks: [],
      deletedItems: [item('some text with odd spacing')],
      addedItems: [],
    });

    expect(c.complete).toBe(true);
  });
});

describe('computeDiffCoverage — what it must still catch', () => {
  it('reports a chunk no item refers to', () => {
    const c = computeDiffCoverage({
      rawDeletedChunks: ['described text', 'לדיווח על תופעות לוואי >'],
      rawAddedChunks: [],
      deletedItems: [item('described text')],
      addedItems: [],
    });

    expect(c.complete).toBe(false);
    expect(c.uncoveredChunks).toEqual([
      { side: 'deleted', text: 'לדיווח על תופעות לוואי >' },
    ]);
  });

  it('does not let an ADDED item cover a DELETED chunk', () => {
    // The two sides mean opposite things. Letting one satisfy the other would
    // hide exactly the case where a removal was recast as an edit.
    const c = computeDiffCoverage({
      rawDeletedChunks: ['the removed sentence'],
      rawAddedChunks: [],
      deletedItems: [],
      addedItems: [item('the removed sentence')],
    });

    expect(c.complete).toBe(false);
    expect(c.uncoveredChunks[0]?.side).toBe('deleted');
  });

  it('weights coverage by characters as well as by chunk count', () => {
    const c = computeDiffCoverage({
      rawDeletedChunks: ['x'.repeat(1000), 'tiny'],
      rawAddedChunks: [],
      deletedItems: [item('x'.repeat(1000))],
      addedItems: [],
    });

    // Half the chunks, but almost all of the text. Both numbers are reported
    // because either alone misleads: counts overstate small omissions, characters
    // hide the loss of a short but decisive line.
    expect(c.chunkRatio).toBe(0.5);
    expect(c.charRatio).toBeGreaterThan(0.99);
  });

  it('treats an empty diff as complete rather than dividing by zero', () => {
    const c = computeDiffCoverage({
      rawDeletedChunks: [],
      rawAddedChunks: [],
      deletedItems: [],
      addedItems: [],
    });

    expect(c.complete).toBe(true);
    expect(c.chunkRatio).toBe(1);
    expect(c.charRatio).toBe(1);
  });

  it('ignores blank chunks, which are a grouping artifact', () => {
    const c = computeDiffCoverage({
      rawDeletedChunks: ['   ', '\n', 'real text'],
      rawAddedChunks: [],
      deletedItems: [item('real text')],
      addedItems: [],
    });

    expect(c.chunkCount).toBe(1);
    expect(c.complete).toBe(true);
  });

  it('does not let an empty quote cover anything', () => {
    const c = computeDiffCoverage({
      rawDeletedChunks: ['real text'],
      rawAddedChunks: [],
      deletedItems: [item('')],
      addedItems: [],
    });

    expect(c.complete).toBe(false);
  });
});
