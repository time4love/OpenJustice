import type { Citation } from '@/types/thesis';

// ---------------------------------------------------------------------------
// THE CITATION TOKENS IN A VERSION'S TEXT — docs/gf-thesis-flows.md A1 :1241–:1245; docs/gf-document-flows.md
// A1 :1241 (`#doc_`); docs/gf-ui-flows.md §17 :532–:538.
//
// The text is the researcher's, and a token in it is a CHIP where the token stands. The grammar is the
// appendix's, and nothing else may follow a prefix: `#ev_0x<64 hex>` · `#tr_<cuid>` · `#doc_<COMMITMENT>`.
// A `#doc_` token is RECOGNISED and renders nothing until the document plan's step 34 (§18 :580–:581) — a kind
// the renderer does not know would print a raw id to a reader, which §4 :167 forbids.
// ---------------------------------------------------------------------------

export type TokenKind = 'EVIDENCE' | 'TRAJECTORY' | 'DOCUMENT';

export interface TokenPiece {
  kind: 'token';
  token: TokenKind;
  /** The value after the prefix — for EVIDENCE the record's name, `0x…`; for TRAJECTORY the row's id. */
  name: string;
  /** The token as it stands in the text, for a diff or a COPY. */
  source: string;
}

export interface TextPiece {
  kind: 'text';
  text: string;
}

export type Piece = TextPiece | TokenPiece;

/**
 * EACH PREFIX HAS ITS OWN SHAPE, and nothing else may follow it (thesis A1 :1242–:1244): `#ev_` takes a record's
 * name, `#tr_` a ClaimTrajectory's cuid, `#doc_` a commitment (document A1 :1241). A single greedy `\S+` would
 * swallow the sentence's full stop into the name and resolve to nothing — the token would render as "a citation
 * that does not resolve" beside a record the body did carry.
 */
const TOKEN = /#(?:(ev)_(0x[0-9a-fA-F]{64})|(tr)_(c[a-z0-9]{24})|(doc)_([A-Za-z0-9_:-]+))/g;
const KIND: Record<string, TokenKind> = { ev: 'EVIDENCE', tr: 'TRAJECTORY', doc: 'DOCUMENT' };

/** A text split at every citation token, in order; the text between tokens is kept exactly as written. */
export function splitTokens(text: string): Piece[] {
  const pieces: Piece[] = [];
  let at = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index;
    const [prefix, name] = [match[1] ?? match[3] ?? match[5] ?? '', match[2] ?? match[4] ?? match[6] ?? ''];
    const kind = KIND[prefix];
    if (kind === undefined) continue;
    if (start > at) pieces.push({ kind: 'text', text: text.slice(at, start) });
    pieces.push({ kind: 'token', token: kind, name, source: match[0] });
    at = start + match[0].length;
  }
  if (at < text.length) pieces.push({ kind: 'text', text: text.slice(at) });
  return pieces;
}

/** The body's citation for a token, by kind and name — `undefined` when the body resolved none (never dropped). */
export function citationFor(piece: TokenPiece, citations: readonly Citation[]): Citation | undefined {
  return citations.find((citation) => citation.kind === piece.token && citation.name === piece.name);
}
