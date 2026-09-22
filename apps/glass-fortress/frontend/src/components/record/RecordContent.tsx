'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import type { ChunkSide, RecordContentValue } from '@/types/record';

// ---------------------------------------------------------------------------
// THE RECORD'S CONTENT — ONE COMPONENT, TWO SURFACES. docs/gf-ui-flows.md §26 clause (1), as REPLACED
// 2026-09-19 by the cold design review the researcher commissioned and accepted whole, and the UI plan's
// :555 (the step's one declared exception, and the repair it carries).
//
// WHY THE CONTENT AND NOT THE PANE. The thesis page's right pane and the corpus record sheet render ONE
// domain object — THE RECORD'S BYTES — inside TWO context objects: a thesis CITATION (pin, verified, flag,
// argued, overObjection) and a corpus ROW (anchor, opinion, narrowed, citedBy, trackedUrlId). Extracting the
// PANE instead would force the corpus to synthesise a citation it does not have — `pin: null`,
// `verified: { notEvaluable }` — and the pane would then draw "not evaluable" as a REASON for a row that
// nothing ever evaluated. So the ELEMENT is one; the CONTEXT and the FEEDING are each surface's own, and
// that is not duplication.
//
// THE MARKS GO IN `children`, BETWEEN THE HEADING AND THE BYTES. That is where both surfaces already draw
// them, and it is the `children`-slot composition the Next guide names (01-app/01-getting-started/
// 05-server-and-client-components.md, "Interleaving Server and Client Components"). A surface that has no
// marks passes nothing and loses nothing.
//
// `.record-captured` IS CALLED AND NEVER RE-SPELLED (§26's 2026-09-19 ruling (1)): it carries
// `--font-serif` for the archive's bytes on all three record surfaces, and `globals.css` is the one place
// it is declared. Of the pane's `.record-*` classes it is, measured, the ONLY one `globals.css` defines —
// the rest are names with no declaration, which is why moving them costs a reader nothing.
//
// THE VOCABULARY IS MAPPED HERE AND NOWHERE ELSE. The backend writes `'REMOVED' | 'ADDED'`
// (`recordDiff.ts`' ContentChunk, and the two constructors beneath it); a reader is shown „לפני" / „אחרי".
// Before this component existed the mapping was spelled in `RecordPane` against `'before'` / `'after'` —
// words the backend has never written — so EVERY chunk of a cited diff, the removed one included, read
// „אחרי". One mapping, in one place, is what makes that unrepeatable rather than merely fixed.
//
// AND IT IS A LOOKUP, NOT A TERNARY — 2026-09-19, and the difference is not style. A ternary has a branch
// for EVERY value that is not its one comparand, so an unexpected side is silently DRAWN as the other
// word: a wrong label a reader cannot tell from a right one, which is the original defect's exact shape.
// A lookup keyed by the side has no such branch. An unknown key is ABSENT, absence is refusable, and
// `satisfies Record<ChunkSide, …>` makes a side added to the union a COMPILE error here rather than a
// quiet mislabel in front of a reader.
// ---------------------------------------------------------------------------

/**
 * The one mapping: the side the walk writes → the message key a reader is shown.
 *
 * `satisfies` RATHER THAN A TYPE ANNOTATION, deliberately: it holds the table TOTAL over `ChunkSide`
 * while keeping the literal key types, so `SIDE_KEY[side]` stays `'before' | 'after'` and needs no cast.
 */
const SIDE_KEY = { REMOVED: 'before', ADDED: 'after' } as const satisfies Record<ChunkSide, 'before' | 'after'>;

/**
 * The side's key, or a REFUSAL naming the value — never a default.
 *
 * Both parsers narrow `side` at the boundary (`lib/thesisBody.ts`' `recordChunk`, `lib/corpusBody.ts`'
 * `chunk`), so this throw is unreachable through a read and is meant to be. It is the difference between
 * "cannot happen" and "cannot happen SILENTLY": if some later path ever hands this component an
 * un-narrowed body, a reader gets nothing rather than a confident wrong word about the archive's bytes.
 */
function sideKeyOf(side: ChunkSide): 'before' | 'after' {
  if (!Object.hasOwn(SIDE_KEY, side)) {
    throw new Error(`RecordContent: a chunk arrived with the side ${JSON.stringify(side)} — the walk writes REMOVED or ADDED, and a body is narrowed at its parser before it reaches here.`);
  }
  return SIDE_KEY[side];
}

export interface RecordContentProps {
  /**
   * The domain line, composed by the surface (`domainOf` / `displayUrl`) — an ID is never text (§4).
   *
   * OPTIONAL, AND ONLY BECAUSE ONE STATE GENUINELY HAS NO BODY TO COMPOSE IT FROM. A diff page answering
   * AWAITING_DERIVATION received a 409 carrying `{ error, code }` and no `page.url` (ui §6 :267), so it
   * cannot know the domain without a SECOND read — which §8 :344 forbids. A surface that does not know it
   * draws no line rather than fabricating one: an empty `<bdi>` would be a mark about a page, made up.
   * That is the same rule this component's own docblock states for the pane — a surface must not
   * synthesise what it does not have.
   */
  domain?: string;
  /** The dated heading: a capture's date, or a diff's interval, in the surface's own approved words. */
  heading: string;
  content: RecordContentValue;
  /** The surface's own marks, drawn between the heading and the bytes. */
  children?: ReactNode;
}

export function RecordContent({ domain, heading, content, children }: RecordContentProps) {
  const t = useTranslations('record');

  return (
    <div data-record-content className="record space-y-3">
      {domain === undefined ? null : (
        <p className="record-head">
          <bdi dir="ltr">{domain}</bdi>
        </p>
      )}
      {/* `dir="auto"` BECAUSE THE HEADING CARRIES A DATE INSIDE HEBREW — „צילום של העמוד מ־23.12.2021" — and a
          date left to the paragraph's own direction renders its parts in the wrong order at the boundary.
          `bidi-isolated` found it on the capture page, where the heading is the page's first line. It belongs
          here rather than at either caller: both surfaces compose the same dated string from the same key. */}
      <h2 dir="auto" className="record-title">{heading}</h2>

      {children}

      {content.kind === 'CAPTURE' ? (
        <div dir="auto" data-record-body="CAPTURE" className="record-captured">
          {content.text}
        </div>
      ) : null}

      {content.kind === 'DIFF' ? (
        <div data-record-body="DIFF" className="space-y-2">
          {content.chunks.map((chunk, index) => (
            <div key={`${chunk.side}-${String(index)}`} data-chunk-side={chunk.side}>
              {/* THE ONE MAPPING, through `SIDE_KEY`: a side outside the union has no entry and is REFUSED
                  by name, where the ternary this replaced drew it as „אחרי" and said nothing. */}
              <p className="record-register">{t(sideKeyOf(chunk.side))}</p>
              <div dir="auto" className="record-captured">
                {chunk.text}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* NO TEXT, by A2 :1144. The shape is the record's own — a head line and a body — so what arrives
          replaces what is drawn rather than displacing it. */}
      {content.kind === 'LOADING' ? (
        <div data-record-body="LOADING" aria-hidden="true" className="animate-pulse space-y-2">
          <div className="h-4 w-1/3 rounded bg-paper-deep" />
          <div className="h-24 rounded bg-paper-deep" />
        </div>
      ) : null}

      {content.kind === 'AWAITING' ? (
        <p data-record-body="AWAITING" className="record-meta">
          {content.statement}
        </p>
      ) : null}
    </div>
  );
}
