/**
 * Assigns sequential footnote numbers to citation nodes in a TipTap doc, in
 * first-appearance (reading) order. The same id repeated later in the doc
 * reuses its original number, matching standard footnote behavior (citing the
 * same source twice doesn't mint a second footnote).
 *
 * Evidence and claim-trajectory mentions share ONE sequence. A footnote can
 * cite both — an anchored record and the deterministic trajectory behind it —
 * and numbering them separately would put two [1] markers in the same sentence.
 *
 * `groupKeyOf` collapses several ids onto one number. It exists for co-movement:
 * a thesis citing an eight-claim block cites eight rows, because the group has no
 * stable id of its own, but those eight rows are ONE finding and must read as
 * one. Left out, every id is its own group and numbering is per-id as before.
 */
export function buildCitationNumbers(
  doc: Record<string, unknown>,
  groupKeyOf: (id: string) => string = (id) => id,
): Map<string, number> {
  const numbers = new Map<string, number>();
  const numberByGroup = new Map<string, number>();
  let next = 1;

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.type === 'evidenceMention' || n.type === 'trajectoryMention') {
      const attrs = n.attrs as Record<string, unknown> | undefined;
      const id = String(attrs?.['id'] ?? '');
      if (id && !numbers.has(id)) {
        const key = groupKeyOf(id);
        const existing = numberByGroup.get(key);
        const assigned = existing ?? next++;
        numberByGroup.set(key, assigned);
        numbers.set(id, assigned);
      }
    }
    const content = n.content as unknown[] | undefined;
    content?.forEach(walk);
  }

  (doc.content as unknown[] | undefined)?.forEach(walk);
  return numbers;
}

type TipTapNodeObj = Record<string, unknown>;

/**
 * Drop the repeats inside a run of consecutive trajectory mentions that cite the
 * same co-movement.
 *
 * A thesis citing an eight-claim block cites eight rows — the group has no
 * stable id of its own (patternHash changes whenever a capture is added), so
 * citing every member is the only way to record that they moved together.
 * Rendering all eight would then report ONE finding as eight, which is the
 * opposite of what the grouping is for.
 *
 * Scoped to a CONSECUTIVE run on purpose: citing the same movement again
 * elsewhere in the thesis is a second citation and still gets its marker.
 *
 * Lives here rather than in the renderer so it can be exercised on a real stored
 * document without mounting React.
 */
export function collapseCoMovementRuns(
  content: TipTapNodeObj[],
  groupKeyOf: (id: string) => string,
): TipTapNodeObj[] {
  const kept: TipTapNodeObj[] = [];
  let seenInRun = new Set<string>();
  for (const node of content) {
    if (node.type !== 'trajectoryMention') {
      seenInRun = new Set<string>();
      kept.push(node);
      continue;
    }
    const id = String((node.attrs as TipTapNodeObj | undefined)?.['id'] ?? '');
    const key = groupKeyOf(id);
    if (seenInRun.has(key)) continue;
    seenInRun.add(key);
    kept.push(node);
  }
  return kept;
}
