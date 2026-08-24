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
//   [^n]  footnote marker — spliced inline as evidenceMention and/or
//         trajectoryMention chips when a `citations` map is supplied (see
//         buildTipTapDoc). One footnote may cite both: the strongest paragraphs
//         pair an anchored record with the deterministic trajectory behind it.
//
// Legacy path (no citations param): after the body, appends a trailing
// evidence-mentions paragraph and a key-figure-mentions paragraph, exactly as
// before footnote support existed — unchanged for backward compatibility.
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

export interface Citation {
  id: number;
  /** Evidence file hashes cited at this footnote. */
  fileHashes?: string[];
  /**
   * ClaimTrajectory ids cited at this footnote — the citable identity of a
   * trajectory, pinned to one detection pass. Never a claimHash.
   */
  trajectoryIds?: string[];
}

/** What one footnote marker expands to, in render order. */
interface CitationTargets {
  fileHashes: string[];
  trajectoryIds: string[];
}

function evidenceMentionNode(hash: string, evidenceLabelMap: ReadonlyMap<string, string>): TipTapNode {
  return {
    type: 'evidenceMention',
    attrs: { id: hash, label: evidenceLabelMap.get(hash) ?? `ev_${hash.slice(0, 10)}` },
  };
}

function trajectoryMentionNode(id: string, trajectoryLabelMap: ReadonlyMap<string, string>): TipTapNode {
  return {
    type: 'trajectoryMention',
    attrs: { id, label: trajectoryLabelMap.get(id) ?? `tr_${id.slice(0, 10)}` },
  };
}

/**
 * Parse inline Markdown spans (**bold**, *italic*, [^n] footnote markers) into
 * TipTap nodes. Footnote markers only splice in mention nodes when
 * citationsById is supplied — otherwise (legacy callers) a `[^n]`-shaped
 * substring is left as ordinary literal text, unchanged from pre-footnote
 * behavior.
 */
const NO_LABELS: ReadonlyMap<string, string> = new Map<string, string>();

function parseInline(
  raw: string,
  citationsById?: Map<number, CitationTargets>,
  evidenceLabelMap?: ReadonlyMap<string, string>,
  trajectoryLabelMap?: ReadonlyMap<string, string>,
): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*|\[\^(\d+)\]|((?:(?!\[\^\d+\])[^*])+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    if (match[1] !== undefined) {
      nodes.push({ type: 'text', marks: [{ type: 'bold' }], text: match[1] });
    } else if (match[2] !== undefined) {
      nodes.push({ type: 'text', marks: [{ type: 'italic' }], text: match[2] });
    } else if (match[3] !== undefined) {
      const targets = citationsById?.get(Number(match[3]));
      if (targets) {
        for (const hash of targets.fileHashes) nodes.push(evidenceMentionNode(hash, evidenceLabelMap ?? NO_LABELS));
        for (const id of targets.trajectoryIds) nodes.push(trajectoryMentionNode(id, trajectoryLabelMap ?? NO_LABELS));
      } else {
        // No citations map at all (legacy caller), or this id has no entry — preserve the
        // literal marker rather than silently dropping it.
        nodes.push({ type: 'text', text: match[0] });
      }
    } else if (match[4] !== undefined) {
      nodes.push({ type: 'text', text: match[4] });
    }
  }
  return nodes;
}

export function buildTipTapDoc(
  body: string,
  hashes: string[],
  figures: string[],
  evidenceLabelMap: ReadonlyMap<string, string>,
  citations?: Citation[],
  trajectories?: { ids: string[]; labels: ReadonlyMap<string, string> },
): TipTapNode {
  const nodes: TipTapNode[] = [];
  const lines = body.split('\n');
  const citationsById = citations
    ? new Map(
        citations.map((c) => [
          c.id,
          { fileHashes: c.fileHashes ?? [], trajectoryIds: c.trajectoryIds ?? [] } satisfies CitationTargets,
        ]),
      )
    : undefined;
  const trajectoryLabelMap = trajectories?.labels ?? NO_LABELS;
  const inline = (raw: string): TipTapNode[] =>
    parseInline(raw, citationsById, evidenceLabelMap, trajectoryLabelMap);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Heading
    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      nodes.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: inline(headingMatch[2]),
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
          content: [{ type: 'paragraph', content: inline(lines[i].replace(/^[-*]\s+/, '')) }],
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
          content: [{ type: 'paragraph', content: inline(lines[i].replace(/^\d+\.\s+/, '')) }],
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
        content: inline(paraLines.join(' ')),
      });
    }
  }

  // Trailing evidence-chip paragraph — only for hashes NOT already rendered
  // inline at a footnote marker. In the legacy path (no citations param),
  // every hash lands here exactly as before footnote support existed.
  const citedHashes = citationsById
    ? new Set([...citationsById.values()].flatMap((t) => t.fileHashes))
    : new Set<string>();
  const uncitedHashes = hashes.filter((hash) => !citedHashes.has(hash));
  if (uncitedHashes.length > 0) {
    nodes.push({
      type: 'paragraph',
      content: uncitedHashes.map((hash) => evidenceMentionNode(hash, evidenceLabelMap)),
    });
  }

  // Same rule for trajectories: a trajectory already rendered inline at a
  // footnote is not repeated in the trailing chip list.
  const citedTrajectoryIds = citationsById
    ? new Set([...citationsById.values()].flatMap((t) => t.trajectoryIds))
    : new Set<string>();
  const uncitedTrajectoryIds = (trajectories?.ids ?? []).filter((id) => !citedTrajectoryIds.has(id));
  if (uncitedTrajectoryIds.length > 0) {
    nodes.push({
      type: 'paragraph',
      content: uncitedTrajectoryIds.map((id) => trajectoryMentionNode(id, trajectoryLabelMap)),
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
