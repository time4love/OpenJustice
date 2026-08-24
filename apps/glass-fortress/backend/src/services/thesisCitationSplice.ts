import type { TipTapNode } from '../utils/tipTapUtils';

// ---------------------------------------------------------------------------
// Adding a citation to a thesis WITHOUT re-authoring it.
//
// The alternative was the only path that existed: read the stored TipTap JSON,
// retype the whole body as Markdown, and resubmit it through add_thesis_version.
// On the first real thesis that is 3,905 characters of Hebrew and 18 inline
// evidence mentions, and the one serializer available (extractText) collapses
// every whitespace run and renders mentions as literal `#ev_0x…` text — so the
// round trip would flatten three headings, nine paragraphs and a bullet list
// into one paragraph and turn seven working citations into prose.
//
// Retyping a document to add a footnote is how the four factual errors caught in
// one paragraph on 2026-08-23 got there. So this never touches the text: it
// finds an anchor, splices mention nodes in after it, and asserts afterwards
// that the concatenated prose is byte-identical to what it started with.
//
// An anchor that matches zero times, or more than once, is a REFUSAL rather
// than a guess. "Probably that one" is not a property a citation may have.
// ---------------------------------------------------------------------------

export interface Placement {
  /** Exact substring of the thesis prose to attach the citation after. */
  anchorText: string;
  /** ClaimTrajectory ids to splice in at that point, in order. */
  trajectoryIds: string[];
}

export type PlacementFailure =
  | { anchorText: string; reason: 'NOT_FOUND' }
  | { anchorText: string; reason: 'AMBIGUOUS'; occurrences: number };

export type SpliceResult =
  | { ok: true; doc: TipTapNode; anchored: { anchorText: string; trajectoryIds: string[] }[] }
  | { ok: false; failures: PlacementFailure[] };

function isTextNode(node: TipTapNode): node is TipTapNode & { text: string } {
  return node.type === 'text' && typeof node.text === 'string';
}

/** Every text run in reading order, concatenated with nothing between. */
export function concatText(node: TipTapNode): string {
  if (isTextNode(node)) return node.text;
  return (node.content ?? []).map(concatText).join('');
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count++;
    from = at + needle.length;
  }
}

function trajectoryMentionNode(id: string, labels: ReadonlyMap<string, string>): TipTapNode {
  return { type: 'trajectoryMention', attrs: { id, label: labels.get(id) ?? `tr_${id.slice(0, 10)}` } };
}

/**
 * Insert the placements' mention nodes into one text node, after each anchor.
 *
 * Returns the replacement node list. Offsets are consumed left to right, so a
 * node holding two anchors stays correct without re-indexing.
 */
function spliceIntoTextNode(
  node: TipTapNode & { text: string },
  placements: readonly Placement[],
  labels: ReadonlyMap<string, string>,
): TipTapNode[] {
  const hits = placements
    .map((p) => ({ placement: p, at: node.text.indexOf(p.anchorText) }))
    .filter((h) => h.at !== -1)
    .sort((a, b) => a.at - b.at);
  if (hits.length === 0) return [node];

  const out: TipTapNode[] = [];
  let cursor = 0;
  for (const hit of hits) {
    const end = hit.at + hit.placement.anchorText.length;
    const before = node.text.slice(cursor, end);
    // Marks travel with the split so bold or italic prose keeps its formatting.
    if (before !== '') out.push({ ...node, text: before });
    for (const id of hit.placement.trajectoryIds) out.push(trajectoryMentionNode(id, labels));
    cursor = end;
  }
  const tail = node.text.slice(cursor);
  if (tail !== '') out.push({ ...node, text: tail });
  return out;
}

function spliceNode(
  node: TipTapNode,
  placements: readonly Placement[],
  labels: ReadonlyMap<string, string>,
): TipTapNode {
  if (!node.content) return node;
  const content: TipTapNode[] = [];
  for (const child of node.content) {
    if (isTextNode(child)) content.push(...spliceIntoTextNode(child, placements, labels));
    else content.push(spliceNode(child, placements, labels));
  }
  return { ...node, content };
}

/**
 * Splice trajectory mentions into a stored thesis document at exact anchors.
 *
 * Every anchor must match exactly once across the whole document. All-or-
 * nothing: one bad anchor refuses the whole call, because a partly-applied
 * citation edit leaves a version nobody asked for.
 */
export function spliceTrajectoryMentions(
  doc: TipTapNode,
  placements: readonly Placement[],
  labels: ReadonlyMap<string, string>,
): SpliceResult {
  const prose = concatText(doc);

  const failures = placements.flatMap((p): PlacementFailure[] => {
    const occurrences = countOccurrences(prose, p.anchorText);
    if (occurrences === 0) return [{ anchorText: p.anchorText, reason: 'NOT_FOUND' }];
    if (occurrences > 1) return [{ anchorText: p.anchorText, reason: 'AMBIGUOUS', occurrences }];
    return [];
  });
  if (failures.length > 0) return { ok: false, failures };

  // An anchor unique in the prose can still straddle two text nodes — a bold
  // span splits a sentence into three runs, and no single run then contains it.
  // Reported as NOT_FOUND rather than silently skipped: the caller must pick a
  // substring that lies inside one run.
  const doc2 = spliceNode(doc, placements, labels);
  const spliced = new Set<string>();
  function collectSpliced(node: TipTapNode): void {
    if (node.type === 'trajectoryMention') {
      const id = node.attrs?.id;
      if (typeof id === 'string') spliced.add(id);
    }
    node.content?.forEach(collectSpliced);
  }
  collectSpliced(doc2);
  const unplaced = placements.filter((p) => !p.trajectoryIds.every((id) => spliced.has(id)));
  if (unplaced.length > 0) {
    return { ok: false, failures: unplaced.map((p) => ({ anchorText: p.anchorText, reason: 'NOT_FOUND' as const })) };
  }

  // The invariant this tool exists for. A splice may only ADD nodes; if a
  // single character of prose moved, the edit is abandoned rather than written.
  const after = concatText(doc2);
  if (after !== prose) {
    throw new Error(
      'Splicing a citation changed the thesis prose. Nothing was written. This is a defect in ' +
        'spliceTrajectoryMentions, not in the input — the operation may only insert mention nodes.',
    );
  }

  return {
    ok: true,
    doc: doc2,
    anchored: placements.map((p) => ({ anchorText: p.anchorText, trajectoryIds: p.trajectoryIds })),
  };
}
