import { buildTipTapDoc, type TipTapNode } from '../src/utils/tipTapUtils';

function paragraphs(doc: TipTapNode): TipTapNode[] {
  return (doc.content ?? []).filter((n) => n.type === 'paragraph');
}

describe('buildTipTapDoc — legacy behavior (no citations param)', () => {
  it('is byte-identical to the pre-footnote behavior: body + trailing evidence chip paragraph', () => {
    const doc = buildTipTapDoc('Plain claim.', ['0xabc'], [], new Map([['0xabc', 'Summary text']]));
    const paras = paragraphs(doc);

    expect(paras).toHaveLength(2);
    expect(paras[0].content).toEqual([{ type: 'text', text: 'Plain claim.' }]);
    expect(paras[1].content).toEqual([
      { type: 'evidenceMention', attrs: { id: '0xabc', label: 'Summary text' } },
    ]);
  });

  it('leaves a literal [^1]-shaped token untouched as plain text when no citations param is given', () => {
    const doc = buildTipTapDoc('Claim referencing [^1] as literal text.', [], [], new Map());
    const paras = paragraphs(doc);

    expect(paras[0].content!.every((n) => n.type === 'text')).toBe(true);
    expect(paras[0].content!.map((n) => n.text).join('')).toBe('Claim referencing [^1] as literal text.');
  });

  it('still appends the trailing evidence paragraph when hashes are given without citations', () => {
    const doc = buildTipTapDoc('Body.', ['0xabc', '0xdef'], [], new Map());
    const paras = paragraphs(doc);
    expect(paras[paras.length - 1].content).toHaveLength(2);
  });
});

describe('buildTipTapDoc — inline footnote citations', () => {
  it('splices an evidenceMention node inline at the marker position within a paragraph', () => {
    const doc = buildTipTapDoc(
      'The ministry knew about side effects[^1] in June.',
      [],
      [],
      new Map([['0xabc', 'Internal report']]),
      [{ id: 1, fileHashes: ['0xabc'] }],
    );
    const content = paragraphs(doc)[0].content!;

    expect(content).toEqual([
      { type: 'text', text: 'The ministry knew about side effects' },
      { type: 'evidenceMention', attrs: { id: '0xabc', label: 'Internal report' } },
      { type: 'text', text: ' in June.' },
    ]);
  });

  it('emits one evidenceMention per hash when a footnote cites multiple records', () => {
    const doc = buildTipTapDoc(
      'A combined claim[^1] follows.',
      [],
      [],
      new Map([
        ['0xaaa', 'First'],
        ['0xbbb', 'Second'],
      ]),
      [{ id: 1, fileHashes: ['0xaaa', '0xbbb'] }],
    );
    const content = paragraphs(doc)[0].content!;

    expect(content).toEqual([
      { type: 'text', text: 'A combined claim' },
      { type: 'evidenceMention', attrs: { id: '0xaaa', label: 'First' } },
      { type: 'evidenceMention', attrs: { id: '0xbbb', label: 'Second' } },
      { type: 'text', text: ' follows.' },
    ]);
  });

  it('reuses the same hash across two different footnote markers without deduping the chips', () => {
    const doc = buildTipTapDoc(
      'First claim[^1]. Second claim[^2].',
      [],
      [],
      new Map([['0xabc', 'Shared evidence']]),
      [
        { id: 1, fileHashes: ['0xabc'] },
        { id: 2, fileHashes: ['0xabc'] },
      ],
    );
    const content = paragraphs(doc)[0].content!;
    const mentions = content.filter((n) => n.type === 'evidenceMention');
    expect(mentions).toHaveLength(2);
  });

  it('parses footnote markers inside heading text', () => {
    const doc = buildTipTapDoc(
      '## A heading claim[^1]',
      [],
      [],
      new Map([['0xabc', 'Label']]),
      [{ id: 1, fileHashes: ['0xabc'] }],
    );
    const heading = doc.content!.find((n) => n.type === 'heading')!;
    expect(heading.content).toContainEqual({ type: 'evidenceMention', attrs: { id: '0xabc', label: 'Label' } });
  });

  it('parses footnote markers inside bullet list item text', () => {
    const doc = buildTipTapDoc(
      '- A bullet claim[^1]',
      [],
      [],
      new Map([['0xabc', 'Label']]),
      [{ id: 1, fileHashes: ['0xabc'] }],
    );
    const listItemPara = doc.content!.find((n) => n.type === 'bulletList')!.content![0].content![0];
    expect(listItemPara.content).toContainEqual({ type: 'evidenceMention', attrs: { id: '0xabc', label: 'Label' } });
  });

  it('falls back to literal marker text when a marker has no matching citations entry', () => {
    const doc = buildTipTapDoc('Unmatched claim[^9].', [], [], new Map(), [{ id: 1, fileHashes: ['0xabc'] }]);
    const content = paragraphs(doc)[0].content!;
    expect(content).toContainEqual({ type: 'text', text: '[^9]' });
  });

  it('does not append the trailing evidence-chip paragraph when citations are supplied', () => {
    const doc = buildTipTapDoc(
      'Claim[^1].',
      ['0xabc'],
      [],
      new Map([['0xabc', 'Label']]),
      [{ id: 1, fileHashes: ['0xabc'] }],
    );
    // Only the body paragraph should exist — no separate trailing chip block.
    expect(paragraphs(doc)).toHaveLength(1);
  });

  it('still appends the key-figure mentions paragraph alongside inline footnotes', () => {
    const doc = buildTipTapDoc(
      'Claim[^1].',
      [],
      ['Some Official'],
      new Map([['0xabc', 'Label']]),
      [{ id: 1, fileHashes: ['0xabc'] }],
    );
    const paras = paragraphs(doc);
    expect(paras[paras.length - 1].content).toEqual([
      { type: 'keyFigureMention', attrs: { id: 'Some Official', label: 'Some Official' } },
    ]);
  });

  it('handles bold/italic marks alongside a footnote marker in the same paragraph', () => {
    const doc = buildTipTapDoc(
      '**Dr. X** was told[^1] directly.',
      [],
      [],
      new Map([['0xabc', 'Label']]),
      [{ id: 1, fileHashes: ['0xabc'] }],
    );
    const content = paragraphs(doc)[0].content!;
    expect(content[0]).toEqual({ type: 'text', marks: [{ type: 'bold' }], text: 'Dr. X' });
    expect(content).toContainEqual({ type: 'evidenceMention', attrs: { id: '0xabc', label: 'Label' } });
  });

  // -------------------------------------------------------------------------
  // Trajectory citations (docs/gf-trajectory-citation-dev-plan.md §3).
  //
  // A footnote may cite an anchored record AND the deterministic trajectory
  // behind it. The strongest paragraphs do exactly that, so both have to land at
  // the same marker, in order.
  // -------------------------------------------------------------------------
  it('resolves a footnote citing evidence and a trajectory together, evidence first', () => {
    const doc = buildTipTapDoc(
      'The claim was removed[^1].',
      [],
      [],
      new Map([['0xabc', 'Label']]),
      [{ id: 1, fileHashes: ['0xabc'], trajectoryIds: ['traj-1'] }],
      { ids: [], labels: new Map([['traj-1', 'Claim text']]) },
    );
    const content = paragraphs(doc)[0].content!;
    expect(content).toEqual([
      { type: 'text', text: 'The claim was removed' },
      { type: 'evidenceMention', attrs: { id: '0xabc', label: 'Label' } },
      { type: 'trajectoryMention', attrs: { id: 'traj-1', label: 'Claim text' } },
      { type: 'text', text: '.' },
    ]);
  });

  it('accepts a footnote citing ONLY a trajectory', () => {
    const doc = buildTipTapDoc(
      'Absent across seven captures[^1].',
      [],
      [],
      new Map(),
      [{ id: 1, trajectoryIds: ['traj-1'] }],
      { ids: [], labels: new Map([['traj-1', 'Claim text']]) },
    );
    expect(paragraphs(doc)[0].content).toContainEqual({
      type: 'trajectoryMention',
      attrs: { id: 'traj-1', label: 'Claim text' },
    });
  });

  it('appends trajectories not tied to a footnote as a trailing chip paragraph', () => {
    const doc = buildTipTapDoc('Body.', [], [], new Map(), undefined, {
      ids: ['traj-1', 'traj-2'],
      labels: new Map([['traj-1', 'One']]),
    });
    const paras = paragraphs(doc);
    expect(paras[paras.length - 1].content).toEqual([
      { type: 'trajectoryMention', attrs: { id: 'traj-1', label: 'One' } },
      // No label loaded — an id-derived placeholder, never a silent drop.
      { type: 'trajectoryMention', attrs: { id: 'traj-2', label: 'tr_traj-2' } },
    ]);
  });

  it('does not repeat a trajectory in the trailing list when it was cited inline', () => {
    const doc = buildTipTapDoc(
      'Claim[^1].',
      [],
      [],
      new Map(),
      [{ id: 1, trajectoryIds: ['traj-1'] }],
      { ids: ['traj-1'], labels: new Map([['traj-1', 'One']]) },
    );
    expect(paragraphs(doc)).toHaveLength(1);
  });
});

