import { markdownToReact } from '@/lib/markdownToReact';
import { citationFor, type TokenPiece } from '@/lib/citationTokens';
import type { Citation, CitationRef } from '@/types/thesis';
import { CitationChip, type ChipKind } from './CitationChip';

// ---------------------------------------------------------------------------
// THE TEXT — docs/gf-ui-flows.md §17 :532–:538. The published version's Markdown as long-form reading, one column,
// Hebrew-first, with every citation token a CHIP where the token stands, carrying the marks the BODY computed.
//
// `pins` is the version's own citation list, and it is what makes the version page's two extra chips possible
// (M4): the record is named by the CURRENT body, the pin is the version's, and a difference between them is a
// fact about the version being read — not a mark, and never a silent omission.
// ---------------------------------------------------------------------------

export interface ThesisTextProps {
  text: string;
  /** The body's resolved citations — the record's facts and its marks. */
  citations: readonly Citation[];
  /** A previous version's own refs, when the page is a version page; absent on the current version's page. */
  pins?: readonly CitationRef[];
  pages: readonly { trackedUrlId: string; url: string }[];
  locale: string;
}

function chipKind(piece: TokenPiece, citation: Citation | undefined, pins: readonly CitationRef[] | undefined): ChipKind {
  if (piece.token === 'TRAJECTORY') return citation === undefined ? 'unresolved' : 'trajectory';
  // A `#doc_` token the body resolves is the document's chip (board י4); one it does not is a statement, as any
  // unresolved token is — never its commitment printed as text (§4 :167).
  if (piece.token === 'DOCUMENT') return citation === undefined ? 'unresolved' : 'document';
  if (citation === undefined) return pins === undefined ? 'unresolved' : 'not-current';
  const pin = pins?.find((ref) => ref.kind === piece.token && ref.name === piece.name)?.pin;
  if (pins !== undefined && citation.kind === 'EVIDENCE' && pin !== citation.pin) return 'repinned';
  return citation.kind === 'EVIDENCE' && citation.record.capture === undefined ? 'diff' : 'capture';
}

export function ThesisText({ text, citations, pins, pages, locale }: ThesisTextProps) {
  return (
    <div data-thesis-text className="md-prose">
      {markdownToReact(text, {
        chip: (piece, key) => {
          // A `#doc_` token is a CHIP since document step 33 (ui §17 :540 as ruled 2026-09-22, board י4): the glyph,
          // the title's first words and one dot. It was RESERVED — drawn as nothing — while no body could carry a
          // DOCUMENT citation; the working view serves one now (thesis A4 :1476, R81 QC), and a token drawn as nothing
          // is a sentence the researcher wrote with a hole in it.
          const citation = citationFor(piece, citations);
          return (
            <CitationChip
              key={key}
              kind={chipKind(piece, citation, pins)}
              name={piece.name}
              source={piece.source}
              citation={citation}
              pageId={citation?.kind === 'EVIDENCE' ? pages.find((page) => page.url === citation.record.url)?.trackedUrlId : undefined}
              locale={locale}
            />
          );
        },
      })}
    </div>
  );
}
