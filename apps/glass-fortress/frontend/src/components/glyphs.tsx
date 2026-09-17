import type { ReactElement } from 'react';

// ---------------------------------------------------------------------------
// THE GLYPHS — docs/gf-ui-refactor-plan.md §9 :1080–:1081; design session §1.8, drawn on canvas page 7.
//
// ONE FILE, TWO NAMED SETS, and every mark is currentColor so its meaning comes from the token it is coloured
// with and never from a value baked into the path:
//
//   GLYPHS — the EIGHT families of the research stream, on a 16 grid at stroke 1.5. UI-8 renders the eleven
//            kinds with them (§10 :1141–:1144). They land here, unused by `src/` today, so that UI-8 does not
//            re-spell them — a second drawing of the same family is the "one rule, many implementations"
//            shape this repository pays for repeatedly.
//   ICONS  — the shell's own controls, on a 24 grid at stroke 2, as the boards draw them. Seven come from
//            canvas page 7; the HOUSE is the eighth, added with the researcher's ruling of 2026-09-16 that
//            the site name at the sidebar's head is the link to `/`.
//
// NO EMOJI ANYWHERE UNDER src/ (§9 :1080; `test/noEmoji.test.ts`). A pictograph in a text node is a glyph
// nobody chose, at a size nobody set, in a colour nobody can theme.
// ---------------------------------------------------------------------------

/** Every glyph and icon takes the same props: it is decorative unless the caller gives it a name. */
interface MarkProps {
  className?: string;
  /** When present the mark is announced; when absent it is `aria-hidden`, which is the default. */
  title?: string;
}

function svg(size: 16 | 24, body: ReactElement, { className, title }: MarkProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${String(size)} ${String(size)}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={size === 16 ? 1.5 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title === undefined ? undefined : 'img'}
      aria-hidden={title === undefined ? true : undefined}
      aria-label={title}
    >
      {body}
    </svg>
  );
}

/** THE EIGHT FAMILIES OF THE STREAM (canvas page 7). Rendered by UI-8; landed here so it does not redraw them. */
export const GLYPHS = {
  /** a researcher's act */
  act: (props: MarkProps = {}) => svg(16, <circle cx="8" cy="8" r="5" fill="currentColor" stroke="none" />, props),
  /** a version */
  version: (props: MarkProps = {}) => svg(16, <><path d="M4 2h5l3 3v9H4z" /><path d="M9 2v3h3" /></>, props),
  /** the model's opinion — dashed, because it is never the platform's word */
  model: (props: MarkProps = {}) => svg(16, <circle cx="8" cy="8" r="5" strokeDasharray="2 2" />, props),
  /** the platform's verdict */
  verdict: (props: MarkProps = {}) => svg(16, <><circle cx="8" cy="8" r="5.25" /><path d="M5.5 8l1.8 1.8L10.5 6.5" /></>, props),
  /** a gap */
  gap: (props: MarkProps = {}) => svg(16, <path d="M6 3H4v10h2M10 3h2v10h-2" />, props),
  /** a publication */
  publication: (props: MarkProps = {}) => svg(16, <><circle cx="8" cy="8" r="5.5" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="2.5" fill="var(--surface)" stroke="none" /></>, props),
  /** a withdrawal */
  withdrawal: (props: MarkProps = {}) => svg(16, <><circle cx="8" cy="8" r="5.25" /><path d="M4.5 11.5l7-7" /></>, props),
  /** a note */
  note: (props: MarkProps = {}) => svg(16, <path d="M3 12.5l1-3.5 7-7 2.5 2.5-7 7z" />, props),
} as const;

/** THE SHELL'S CONTROLS. Seven from canvas page 7, plus the house the name link carries. */
export const ICONS = {
  /** the way to `/` — the door, which is what a reader sees before anything is chosen */
  house: (props: MarkProps = {}) => svg(24, <><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M9.5 21v-6h5v6" /></>, props),
  search: (props: MarkProps = {}) => svg(24, <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>, props),
  collapse: (props: MarkProps = {}) => svg(24, <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>, props),
  menu: (props: MarkProps = {}) => svg(24, <path d="M3 6h18M3 12h18M3 18h18" />, props),
  copy: (props: MarkProps = {}) => svg(24, <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>, props),
  chevron: (props: MarkProps = {}) => svg(24, <path d="M15 6l-6 6 6 6" />, props),
  back: (props: MarkProps = {}) => svg(24, <path d="M5 12h14M13 6l6 6-6 6" />, props),
  forward: (props: MarkProps = {}) => svg(24, <path d="M19 12H5M11 6l-6 6 6 6" />, props),
} as const;
