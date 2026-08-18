/**
 * Assigns sequential footnote numbers to evidenceMention nodes in a TipTap
 * doc, in first-appearance (reading) order. The same evidence id repeated
 * later in the doc reuses its original number, matching standard footnote
 * behavior (citing the same source twice doesn't mint a second footnote).
 */
export function buildEvidenceCitationNumbers(doc: Record<string, unknown>): Map<string, number> {
  const numbers = new Map<string, number>();
  let next = 1;

  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (n.type === 'evidenceMention') {
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
