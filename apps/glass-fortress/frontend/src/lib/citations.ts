/**
 * Assigns sequential footnote numbers to citation nodes in a TipTap doc, in
 * first-appearance (reading) order. The same id repeated later in the doc
 * reuses its original number, matching standard footnote behavior (citing the
 * same source twice doesn't mint a second footnote).
 *
 * Evidence and claim-trajectory mentions share ONE sequence. A footnote can
 * cite both — an anchored record and the deterministic trajectory behind it —
 * and numbering them separately would put two [1] markers in the same sentence.
 */
export function buildCitationNumbers(doc: Record<string, unknown>): Map<string, number> {
  const numbers = new Map<string, number>();
  let next = 1;

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.type === 'evidenceMention' || n.type === 'trajectoryMention') {
      const attrs = n.attrs as Record<string, unknown> | undefined;
      const id = String(attrs?.['id'] ?? '');
      if (id && !numbers.has(id)) numbers.set(id, next++);
    }
    const content = n.content as unknown[] | undefined;
    content?.forEach(walk);
  }

  (doc.content as unknown[] | undefined)?.forEach(walk);
  return numbers;
}
