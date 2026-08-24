// ---------------------------------------------------------------------------
// Deterministic language checks for publishing a thesis.
//
// COMPLIANCE.md Rule 1 (allegations, not conclusions) and Rule 4 (official
// capacity) are implemented here as far as they can be WITHOUT a model:
//
//   every sentence that names a key figure must carry a hedge marker in that
//   same sentence.
//
// Per SENTENCE, not per document. "Contains at least one hedge" is trivially
// satisfied by a text that hedges once and asserts flatly ten times. Requiring
// the hedge beside the name is reproducible and implements Rule 1 directly.
//
// What this does not do: it can be satisfied by sprinkling לכאורה. It raises the
// floor; it does not establish good faith — the same posture as the substance
// gate (did you argue, not are you right). Rule 4 judgment lives in the
// advisory model pass beside it. Keep this deterministic.
// ---------------------------------------------------------------------------

/**
 * The hedge vocabulary from the defamation-risk analysis (2026-08-09). Taken
 * from the documented list, not invented; extend only by amending that record.
 *
 * TWO KINDS, and the second was missing.
 *
 * A MODAL hedge softens the assertion — לכאורה, ייתכן כי. An ATTRIBUTIVE hedge
 * does something stronger: it says who is asserting it. "According to the
 * documents, X" does not claim X; it claims the documents say X, which is a
 * different and checkable proposition. That is Rule 1 satisfied more precisely
 * than a modal, not less.
 *
 * The list always held attribution — to DOCUMENTS (על פי המסמכים, המסמכים
 * מצביעים, על פי ראיה). It simply had no phrase for attributing to a published
 * REPORT, so a sentence reading "among them, ACCORDING TO THE REPORT, Dr X"
 * failed a check whose entire purpose it satisfied. Found by the gate refusing a
 * real thesis over it (FINDING 60).
 *
 * THE RULE FOR EXTENDING THIS: a phrase qualifies only if it attributes the
 * assertion to an identified external source, or marks it as unproven. A phrase
 * that merely softens tone does not. Every addition amends the record above.
 */
export const HEDGE_MARKERS: readonly string[] = [
  // Modal — the assertion is marked unproven.
  'לכאורה',
  'ייתכן כי',
  // Attributive — the assertion belongs to a named source, not to us.
  'הראיות מצביעות על',
  'על פי המסמכים',
  'המסמכים מצביעים',
  'בהתאם לממצאים',
  'על פי ראיה',
  'לפי הדיווח',
  'על פי הדיווח',
  'לפי הפרסום',
  'על פי הפרסום',
  'לפי התחקיר',
  'על פי התחקיר',
];

/**
 * A figure-naming sentence longer than this is refused rather than judged. The
 * check is per sentence; a run of text with no terminal punctuation would
 * otherwise be ONE sentence, and a single hedge anywhere in it would pass the
 * whole run — the per-document weakness the check exists to avoid. Failing
 * closed is deterministic and the author's fix is punctuation.
 */
export const MAX_SENTENCE_LENGTH = 300;

/** The minimum a Rule 5 public-interest statement must be to count as present. */
export const MIN_PUBLIC_INTEREST_STATEMENT_LENGTH = 40;

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'listItem', 'blockquote']);

/** A sentence that names at least one key figure, with its hedge status. */
export interface FigureSentence {
  text: string;
  figures: string[];
  hedged: boolean;
  /** Set when the unit exceeds MAX_SENTENCE_LENGTH; it fails regardless of hedging. */
  tooLong?: true;
}

export interface HedgeCheckResult {
  passed: boolean;
  /** Every sentence that names a figure, hedged or not, so a refusal can quote them. */
  sentences: FigureSentence[];
  unhedged: FigureSentence[];
}

/** Inline text of one block. Mention chips render as the figure's name. */
function inlineText(node: TipTapNode, figuresSeen: Set<string>): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'keyFigureMention') {
    const id = node.attrs?.id;
    const name = typeof id === 'string' ? id : '';
    if (name) figuresSeen.add(name);
    return name;
  }
  if (node.type === 'evidenceMention' || node.type === 'trackedUrlMention') return '';
  if (node.type === 'hardBreak') return ' ';
  return (node.content ?? []).map((c) => inlineText(c, figuresSeen)).join('');
}

/**
 * Blocks of the document, each as a flat string. A block's children that are
 * themselves blocks (a list item's paragraphs) are flattened into it.
 */
function blocks(node: TipTapNode, acc: string[], figuresSeen: Set<string>): void {
  if (BLOCK_TYPES.has(node.type)) {
    const hasBlockChildren = (node.content ?? []).some((c) => BLOCK_TYPES.has(c.type));
    if (!hasBlockChildren) {
      acc.push(inlineText(node, figuresSeen));
      return;
    }
  }
  for (const child of node.content ?? []) blocks(child, acc, figuresSeen);
}

/** Sentence boundaries: terminal punctuation followed by whitespace or end of block. */
export function splitSentences(block: string): string[] {
  return block
    .split(/(?<=[.!?؟])\s+|(?<=[.!?؟])$/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whether a sentence carries prose beyond the figure names themselves. A block
 * that is only mention chips — the trailing key-figure index buildTipTapDoc
 * appends — is a citation list, not an assertion about anyone.
 */
function hasProseBeyondNames(sentence: string, figures: string[]): boolean {
  let rest = sentence;
  for (const f of figures) rest = rest.replace(new RegExp(escapeRegExp(f), 'gu'), '');
  return /[\p{L}\p{N}]/u.test(rest);
}

/**
 * Check 7: every sentence naming a key figure carries a hedge marker.
 *
 * `figureNames` must be EVERY known figure — all KeyFigure rows, not just the
 * names this thesis tagged. A name typed as plain text is exactly how an
 * unhedged allegation is most easily written, and it would be invisible to a
 * check that only knew the tagged ones. Mention chips inside the document are
 * detected regardless, since they render as the name. A novel name known to
 * nobody is still not caught; the caller's output must say so.
 */
export function checkFiguresHedged(document: unknown, figureNames: readonly string[]): HedgeCheckResult {
  const root = document as TipTapNode;
  const figuresSeen = new Set<string>(figureNames.filter((n) => n.trim() !== ''));
  const blockTexts: string[] = [];
  blocks(root, blockTexts, figuresSeen);

  const names = [...figuresSeen];
  const sentences: FigureSentence[] = [];

  for (const block of blockTexts) {
    for (const sentence of splitSentences(block)) {
      const figures = names.filter((n) => sentence.includes(n));
      if (figures.length === 0) continue;
      if (!hasProseBeyondNames(sentence, figures)) continue;
      const hedged = HEDGE_MARKERS.some((m) => sentence.includes(m));
      const tooLong = sentence.length > MAX_SENTENCE_LENGTH;
      sentences.push({ text: sentence, figures, hedged: hedged && !tooLong, ...(tooLong ? { tooLong: true as const } : {}) });
    }
  }

  const unhedged = sentences.filter((s) => !s.hedged);
  return { passed: unhedged.length === 0, sentences, unhedged };
}

/**
 * Check 8: the Rule 5 public-interest anchor is present and non-trivial.
 * Structural: a dedicated field, not a phrase hunted for in the body.
 */
export function checkPublicInterestStatement(statement: string | null | undefined): {
  passed: boolean;
  reason: string | null;
} {
  const trimmed = (statement ?? '').trim();
  if (trimmed === '') {
    return { passed: false, reason: 'publicInterestStatement is not set.' };
  }
  if (trimmed.length < MIN_PUBLIC_INTEREST_STATEMENT_LENGTH) {
    return {
      passed: false,
      reason: `publicInterestStatement is ${String(trimmed.length)} characters; at least ${String(MIN_PUBLIC_INTEREST_STATEMENT_LENGTH)} are required to state a public interest.`,
    };
  }
  return { passed: true, reason: null };
}
