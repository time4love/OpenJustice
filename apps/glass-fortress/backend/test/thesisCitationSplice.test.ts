// ---------------------------------------------------------------------------
// Splicing a citation into a thesis without re-authoring it.
//
// The tool exists because the only alternative was retyping 3,905 characters of
// Hebrew out of stored JSON, past seven working citations, to add one footnote.
// So the property that matters most here is not that the mention lands in the
// right place — it is that the prose is untouched, asserted rather than assumed.
// ---------------------------------------------------------------------------

import { concatText, spliceTrajectoryMentions } from '../src/services/thesisCitationSplice';
import type { TipTapNode } from '../src/utils/tipTapUtils';

const LABELS = new Map([
  ['traj-1', 'claim one'],
  ['traj-2', 'claim two'],
]);

function para(...content: TipTapNode[]): TipTapNode {
  return { type: 'paragraph', content };
}
function text(s: string, marks?: { type: string }[]): TipTapNode {
  return marks ? { type: 'text', marks, text: s } : { type: 'text', text: s };
}
function doc(...content: TipTapNode[]): TipTapNode {
  return { type: 'doc', content };
}

/** The document shape the real staging thesis has: prose with inline mentions. */
const THESIS = doc(
  { type: 'heading', attrs: { level: 1 }, content: [text('שינויי מצגי הבטיחות')] },
  para(
    text('בין התצלום מ-24 ביולי 2022 לתצלום מ-5 באוגוסט 2022 הוסרו מן העמוד הנחיות ונתונים.'),
    { type: 'evidenceMention', attrs: { id: '0xabc', label: 'ev' } },
  ),
  para(text('הטענות נותרו נעדרות לאורך שבעה תצלומים נוספים, עד התצלום מ-5 בספטמבר 2022.')),
);

describe('spliceTrajectoryMentions', () => {
  it('inserts the mention immediately after the anchor and leaves the prose byte-identical', () => {
    const before = concatText(THESIS);
    const result = spliceTrajectoryMentions(
      THESIS,
      [{ anchorText: 'עד התצלום מ-5 בספטמבר 2022.', trajectoryIds: ['traj-1'] }],
      LABELS,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(concatText(result.doc)).toBe(before);

    const lastPara = result.doc.content?.[2];
    expect(lastPara?.content?.map((n) => n.type)).toEqual(['text', 'trajectoryMention']);
    expect(lastPara?.content?.[1].attrs).toEqual({ id: 'traj-1', label: 'claim one' });
  });

  it('does not mutate the document it was given', () => {
    const snapshot = JSON.stringify(THESIS);
    spliceTrajectoryMentions(THESIS, [{ anchorText: 'הוסרו מן העמוד', trajectoryIds: ['traj-1'] }], LABELS);
    expect(JSON.stringify(THESIS)).toBe(snapshot);
  });

  it('splices mid-sentence, splitting the text run and keeping both halves', () => {
    const result = spliceTrajectoryMentions(
      THESIS,
      [{ anchorText: 'הוסרו מן העמוד', trajectoryIds: ['traj-1'] }],
      LABELS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const types = result.doc.content?.[1].content?.map((n) => n.type);
    expect(types).toEqual(['text', 'trajectoryMention', 'text', 'evidenceMention']);
    expect(concatText(result.doc)).toBe(concatText(THESIS));
  });

  it('places several trajectories at one anchor, in order — a co-movement is cited whole', () => {
    const result = spliceTrajectoryMentions(
      THESIS,
      [{ anchorText: 'עד התצלום מ-5 בספטמבר 2022.', trajectoryIds: ['traj-1', 'traj-2'] }],
      LABELS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.content?.[2].content?.slice(1).map((n) => n.attrs?.['id'])).toEqual(['traj-1', 'traj-2']);
  });

  it('handles two anchors inside one text run without shifting the second', () => {
    const source = doc(para(text('First sentence here. Second sentence here.')));
    const result = spliceTrajectoryMentions(
      source,
      [
        { anchorText: 'First sentence here.', trajectoryIds: ['traj-1'] },
        { anchorText: 'Second sentence here.', trajectoryIds: ['traj-2'] },
      ],
      LABELS,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.doc.content?.[0].content?.map((n) => n.text ?? n.attrs?.['id'])).toEqual([
      'First sentence here.',
      'traj-1',
      ' Second sentence here.',
      'traj-2',
    ]);
    expect(concatText(result.doc)).toBe('First sentence here. Second sentence here.');
  });

  it('keeps the marks on a split run, so bold prose stays bold', () => {
    const source = doc(para(text('bold claim text', [{ type: 'bold' }])));
    const result = spliceTrajectoryMentions(source, [{ anchorText: 'bold claim', trajectoryIds: ['traj-1'] }], LABELS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [first, , third] = result.doc.content![0].content!;
    expect(first.marks).toEqual([{ type: 'bold' }]);
    expect(third.marks).toEqual([{ type: 'bold' }]);
  });

  it('refuses an anchor that does not appear — a citation may not be placed by guess', () => {
    const result = spliceTrajectoryMentions(THESIS, [{ anchorText: 'no such sentence', trajectoryIds: ['traj-1'] }], LABELS);
    expect(result).toEqual({ ok: false, failures: [{ anchorText: 'no such sentence', reason: 'NOT_FOUND' }] });
  });

  it('refuses an ambiguous anchor and says how many times it matched', () => {
    const source = doc(para(text('the page changed. and later the page changed. again')));
    const result = spliceTrajectoryMentions(source, [{ anchorText: 'the page changed.', trajectoryIds: ['traj-1'] }], LABELS);
    expect(result).toEqual({
      ok: false,
      failures: [{ anchorText: 'the page changed.', reason: 'AMBIGUOUS', occurrences: 2 }],
    });
  });

  it('refuses an anchor split across formatting runs rather than silently skipping it', () => {
    // Unique in the prose, but no single text run contains it: **bold** cuts the
    // sentence into three. Silently dropping the placement would report success
    // on a version with no citation in it.
    const source = doc(para(text('the minister '), text('said', [{ type: 'bold' }]), text(' nothing')));
    const result = spliceTrajectoryMentions(source, [{ anchorText: 'minister said', trajectoryIds: ['traj-1'] }], LABELS);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failures[0]).toEqual({ anchorText: 'minister said', reason: 'NOT_FOUND' });
  });

  it('is all-or-nothing: one bad anchor refuses the whole call', () => {
    const result = spliceTrajectoryMentions(
      THESIS,
      [
        { anchorText: 'הוסרו מן העמוד', trajectoryIds: ['traj-1'] },
        { anchorText: 'not present at all', trajectoryIds: ['traj-2'] },
      ],
      LABELS,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // Only the bad one is reported, and nothing was produced to write.
    expect(result.failures.map((f) => f.anchorText)).toEqual(['not present at all']);
  });

  it('falls back to an id-derived label rather than dropping an unlabelled citation', () => {
    const result = spliceTrajectoryMentions(THESIS, [{ anchorText: 'הוסרו מן העמוד', trajectoryIds: ['traj-9'] }], new Map());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.doc.content?.[1].content?.[1].attrs).toEqual({ id: 'traj-9', label: 'tr_traj-9' });
  });
});

describe('concatText', () => {
  it('joins text runs with nothing between them, so the comparison is exact', () => {
    // extractText joins with spaces and collapses whitespace, which is why it
    // cannot be used to prove prose is unchanged.
    expect(concatText(doc(para(text('a'), text('b'), { type: 'evidenceMention', attrs: { id: 'x' } }, text('c'))))).toBe('abc');
  });
});
