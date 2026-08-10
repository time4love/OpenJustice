// ---------------------------------------------------------------------------
// TipTap document builder
//
// Parses Markdown-flavoured body text into proper TipTap nodes so LLM agents
// can produce richly formatted theses using familiar Markdown syntax:
//
//   # H1  ## H2  ### H3
//   **bold**  *italic*
//   - bullet item
//   1. ordered item
//   blank line = paragraph break
//
// After the body, appends an evidence-mentions paragraph and a key-figure-
// mentions paragraph so citations are embedded as TipTap mention nodes.
// ---------------------------------------------------------------------------

export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  marks?: TipTapMark[];
  content?: TipTapNode[];
  text?: string;
}

/** Parse inline Markdown spans (**bold**, *italic*) into TipTap text nodes with marks. */
function parseInline(raw: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|([^*]+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    if (match[1] !== undefined) {
      nodes.push({ type: 'text', marks: [{ type: 'bold' }], text: match[1] });
    } else if (match[2] !== undefined) {
      nodes.push({ type: 'text', marks: [{ type: 'italic' }], text: match[2] });
    } else if (match[3] !== undefined) {
      nodes.push({ type: 'text', text: match[3] });
    }
  }
  return nodes;
}

export function buildTipTapDoc(
  body: string,
  hashes: string[],
  figures: string[],
  evidenceLabelMap: Map<string, string>,
): TipTapNode {
  const nodes: TipTapNode[] = [];
  const lines = body.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      nodes.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: parseInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    // Bullet list — collect consecutive bullet lines into one bulletList node
    if (/^[-*]\s+/.test(line)) {
      const listItems: TipTapNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        listItems.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(lines[i].replace(/^[-*]\s+/, '')) }],
        });
        i++;
      }
      nodes.push({ type: 'bulletList', content: listItems });
      continue;
    }

    // Ordered list — collect consecutive numbered lines
    if (/^\d+\.\s+/.test(line)) {
      const listItems: TipTapNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        listItems.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInline(lines[i].replace(/^\d+\.\s+/, '')) }],
        });
        i++;
      }
      nodes.push({ type: 'orderedList', attrs: { start: 1 }, content: listItems });
      continue;
    }

    // Blank line — skip
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — accumulate non-special lines until blank or block element
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,3}\s/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      nodes.push({
        type: 'paragraph',
        content: parseInline(paraLines.join(' ')),
      });
    }
  }

  // Evidence mentions paragraph (one chip per hash)
  if (hashes.length > 0) {
    nodes.push({
      type: 'paragraph',
      content: hashes.map((hash) => ({
        type: 'evidenceMention',
        attrs: { id: hash, label: evidenceLabelMap.get(hash) ?? `ev_${hash.slice(0, 10)}` },
      })),
    });
  }

  // Key figure mentions paragraph (one chip per name)
  if (figures.length > 0) {
    nodes.push({
      type: 'paragraph',
      content: figures.map((name) => ({
        type: 'keyFigureMention',
        attrs: { id: name, label: name },
      })),
    });
  }

  // TipTap requires at least one node
  if (nodes.length === 0) {
    nodes.push({ type: 'paragraph', content: [] });
  }

  return { type: 'doc', content: nodes };
}
