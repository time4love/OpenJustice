import { Fragment, type ReactNode } from 'react';
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { splitTokens, type TokenPiece } from '@/lib/citationTokens';

// ---------------------------------------------------------------------------
// THE PUBLISHED TEXT, RENDERED — docs/gf-ui-flows.md §17 :532–:538 ("the published version's Markdown as long-form
// reading … each citation token is a CHIP inline where the token stands"); thesis A2 :1273 (the text IS Markdown
// with tokens); UI plan :425–:427 ("One Markdown renderer, chosen at the step … never TipTap").
//
// TOKENS, NEVER AN HTML STRING. `markdown-it` is used as a PARSER: its token stream is mapped to React elements
// here, so a chip is a React element where its token stands and nothing is ever handed to
// `dangerouslySetInnerHTML`. `html: false` renders raw HTML in the researcher's text as the text it is.
//
// BIDI (§17 :533–:534). A URL, a date or a hash inside Hebrew text reverses the line right-to-left, so each is
// wrapped in `<bdi dir="ltr">`. The patterns live here, once, and the instrument reads them from here. A TABLE
// CELL IS A TEXT RUN LIKE ANY OTHER and goes through the same `inlineText`, so a date in a cell is isolated
// exactly as a date in a paragraph is.
//
// EVERY CAPABILITY THE RESEARCHER'S DRAFTING PRODUCES (§17 :538 as amended 2026-09-18). The text is written
// with a model in claude.ai, so whatever that drafting emits must arrive: emphasis, strikethrough, lists,
// quotes and TABLES. *"A capability silently dropped is a sentence the researcher wrote and no reader sees"* —
// and this file dropped three of them in exactly that way, mapping `strong_open`, `em_open` and `s_open` to an
// empty `break`. The parser emitted them; the map threw them away; the words rendered unemphasised and nothing
// failed. Emphasis was never DISABLED here — it was RECEIVED AND DISCARDED, which is why no configuration
// change would have found it.
//
// WHAT STAYS OFF, AND IT IS SECURITY RATHER THAN CAPABILITY (§17 :538): `html: false` — "every capability"
// never means raw markup, so HTML in the researcher's text renders as the text it is — and `linkify: false`,
// so a bare URL stays isolated text rather than becoming a link nobody chose. `<https://…>` is a CommonMark
// AUTOLINK, not HTML, and is a link the researcher wrote.
//
// RULED OUT BY THE RESEARCHER, 2026-09-18, and NOT an omission: TASK LISTS (`- [ ]`) and FOOTNOTES (`[^1]`).
// Both need an npm plugin, and a thesis is an ARGUMENT and not a working document. Their marks stay in the
// text as written, and `every-markdown-capability` holds that they do — a ruling with no case is a surprise
// waiting for the next reader.
// ---------------------------------------------------------------------------

// `table` and `strikethrough` are ENABLED on the commonmark preset rather than switching to `default`:
// `default` would also turn on `linkify`, which is off by the clause above. Measured on the preset as it
// stands — `strong_open`/`em_open` are already emitted, `s_open` and the twelve table tokens are not.
const markdown = new MarkdownIt('commonmark', { html: false, linkify: false, typographer: false }).enable([
  'table',
  'strikethrough',
]);

/** What must be isolated inside Hebrew text: a URL, a date in either common form, a hash, a wayback timestamp. */
export const ISOLATE = /(https?:\/\/\S+|\d{1,2}[./]\d{1,2}[./]\d{2,4}|\d{4}-\d{2}-\d{2}|(?:0x)?[0-9a-f]{64}|\b\d{14}\b)/gi;

/** A text run with every URL, date and hash inside `<bdi dir="ltr">` — the rest exactly as the researcher wrote it. */
export function isolated(text: string, keyPrefix: string): ReactNode[] {
  return text.split(ISOLATE).map((part, index) =>
    index % 2 === 1 ? (
      <bdi dir="ltr" key={`${keyPrefix}-bdi-${String(index)}`}>
        {part}
      </bdi>
    ) : (
      <Fragment key={`${keyPrefix}-t-${String(index)}`}>{part}</Fragment>
    ),
  );
}

export interface MarkdownOptions {
  /** The chip a citation token becomes, where it stands. A token the body did not resolve is still a chip. */
  chip: (piece: TokenPiece, key: string) => ReactNode;
}

function inlineText(text: string, key: string, options: MarkdownOptions): ReactNode[] {
  return splitTokens(text).map((piece, index) =>
    piece.kind === 'token' ? (
      <Fragment key={`${key}-c${String(index)}`}>{options.chip(piece, `${key}-c${String(index)}`)}</Fragment>
    ) : (
      <Fragment key={`${key}-t${String(index)}`}>{isolated(piece.text, `${key}-t${String(index)}`)}</Fragment>
    ),
  );
}

/** The inline containers that WRAP a run rather than replacing it, each by the element it becomes. */
const INLINE_WRAPPER: Record<string, 'strong' | 'em' | 's' | 'a'> = {
  strong_open: 'strong',
  em_open: 'em',
  s_open: 's',
  link_open: 'a',
};

/**
 * One inline token stream (`token.children`) as React nodes.
 *
 * ONE STACK FOR EVERY WRAPPER, and that is not tidiness either. The previous spelling carried a single
 * `openLink` variable, which could hold ONE container and only a link — so `**bold *and italic***` had
 * nowhere to nest even once emphasis existed. A stack takes them in any order and to any depth, and it is
 * the same shape `blocks` below already uses for lists and quotes.
 */
function inlineNodes(children: readonly Token[], key: string, options: MarkdownOptions): ReactNode[] {
  const nodes: ReactNode[] = [];
  const open: { tag: 'strong' | 'em' | 's' | 'a'; href: string; children: ReactNode[] }[] = [];
  const push = (node: ReactNode): void => {
    const inside = open.at(-1);
    if (inside === undefined) nodes.push(node);
    else inside.children.push(node);
  };
  children.forEach((token, index) => {
    const at = `${key}-${String(index)}`;
    const wrapper = INLINE_WRAPPER[token.type];
    if (wrapper !== undefined) {
      open.push({ tag: wrapper, href: token.attrGet('href') ?? '', children: [] });
      return;
    }
    if (token.type.endsWith('_close') && INLINE_WRAPPER[`${token.type.slice(0, -6)}_open`] !== undefined) {
      const closed = open.pop();
      if (closed === undefined) return;
      push(
        closed.tag === 'a' ? (
          <a key={at} href={closed.href} rel="noopener noreferrer nofollow" target="_blank" className="underline">
            {closed.children}
          </a>
        ) : (
          // `<strong>`, `<em>` and `<s>` carry MEANING and not a size, so they take no class: the reading
          // region owns the face and the leading, and a local utility could only disagree with it.
          <closed.tag key={at}>{closed.children}</closed.tag>
        ),
      );
      return;
    }
    switch (token.type) {
      case 'text':
        push(<Fragment key={at}>{inlineText(token.content, at, options)}</Fragment>);
        break;
      case 'code_inline':
        push(
          <code key={at} dir="ltr" className="rounded bg-paper-deep px-1 text-sm">
            {token.content}
          </code>,
        );
        break;
      case 'softbreak':
        push(<Fragment key={at}> </Fragment>);
        break;
      case 'hardbreak':
        push(<br key={at} />);
        break;
      case 'image':
        push(<Fragment key={at}>{token.content}</Fragment>);
        break;
      default:
        // A token type this map does not know renders as its own source text — never dropped silently.
        push(<Fragment key={at}>{token.content}</Fragment>);
    }
  });
  return nodes;
}

const HEADING: Record<string, 'h2' | 'h3' | 'h4'> = { h1: 'h2', h2: 'h2', h3: 'h3', h4: 'h4', h5: 'h4', h6: 'h4' };

/**
 * The block containers that open and close around their children — the four the read already had, and the
 * six a TABLE adds. Measured from the parser, not remembered: with `table` enabled the stream carries exactly
 * `table · thead · tr · th · tbody · td`, each as an `_open`/`_close` pair, twelve token types in all.
 */
const BLOCK_CONTAINER = ['bullet_list', 'ordered_list', 'list_item', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td'];

/**
 * A cell's alignment, as a CLASS rather than the parser's inline style.
 *
 * markdown-it writes alignment as `style="text-align:left|right|center"` on `th`/`td`. The three values are
 * the PARSER's own and can never be the researcher's text — but writing a parsed string into a `style`
 * attribute is a habit worth not having, and it is one line to not have it. The alignment is honoured; the
 * mechanism is not carried through. Anything else the parser might ever put there is ignored, by omission.
 */
function alignmentClass(token: Token): string | undefined {
  const style = token.attrGet('style') ?? '';
  if (style.includes('text-align:left')) return 'md-align-left';
  if (style.includes('text-align:right')) return 'md-align-right';
  if (style.includes('text-align:center')) return 'md-align-center';
  return undefined;
}

/** The block tokens as React elements, in document order. */
function blocks(tokens: readonly Token[], options: MarkdownOptions): ReactNode[] {
  const out: ReactNode[] = [];
  const stack: { tag: string; className?: string; children: ReactNode[] }[] = [];
  const push = (node: ReactNode): void => {
    const open = stack.at(-1);
    if (open === undefined) out.push(node);
    else open.children.push(node);
  };

  tokens.forEach((token, index) => {
    const key = `b${String(index)}`;
    if (token.type.endsWith('_open') && BLOCK_CONTAINER.some((name) => token.type === `${name}_open`)) {
      stack.push({ tag: token.tag, className: alignmentClass(token), children: [] });
      return;
    }
    if (token.type.endsWith('_close') && BLOCK_CONTAINER.some((name) => token.type === `${name}_close`)) {
      const closed = stack.pop();
      if (closed === undefined) return;
      const Tag = closed.tag as 'ul' | 'ol' | 'li' | 'blockquote' | 'table' | 'thead' | 'tbody' | 'tr' | 'th' | 'td';
      const element = (
        <Tag
          key={key}
          className={Tag === 'ul' ? 'list-disc ps-6' : Tag === 'ol' ? 'list-decimal ps-6' : Tag === 'table' ? 'md-table' : closed.className}
        >
          {closed.children}
        </Tag>
      );
      // A TABLE SCROLLS INSIDE ITS OWN BOX AND NEVER WIDENS THE PAGE (§17 :538; §6 :963's
      // `scrollWidth <= 375`). "One column" governs the READING MEASURE, not which blocks may appear — so
      // the table gets a scrollport of its own rather than the page getting a horizontal scrollbar.
      push(Tag === 'table' ? <div key={key} data-table-scroll className="md-table-scroll">{element}</div> : element);
      return;
    }
    if (token.type === 'inline') {
      push(<Fragment key={key}>{inlineNodes(token.children ?? [], key, options)}</Fragment>);
      return;
    }
    if (token.type === 'heading_open' || token.type === 'paragraph_open' || token.type === 'heading_close' || token.type === 'paragraph_close') {
      if (token.type === 'heading_open' || token.type === 'paragraph_open') stack.push({ tag: token.tag, children: [] });
      else {
        const closed = stack.pop();
        if (closed === undefined) return;
        const Tag = (HEADING[closed.tag] ?? 'p') as 'h2' | 'h3' | 'h4' | 'p';
        // NO `leading-relaxed` ON A PARAGRAPH. It is Tailwind's 1.625, and it OVERRODE the reading
        // region's 1.75 (§1.8): measured in the local run as 17/27.625 where the design says 17/29.75.
        // The REGION owns the leading (`.reading`); a paragraph that re-states it can only disagree.
        //
        // The comment sits ABOVE the call and not inside its argument list: a `//` comment between
        // `push(` and a JSX element is accepted by tsc and was reported by the dev server's SWC as
        // `Expected ',', got 'ident'`. Whether that error was live or a stale buffer I could not settle
        // from the console, so the ambiguity is removed rather than argued with.
        // NO `font-semibold` ON A HEADING EITHER, and it is the same defect as the line above, found the
        // same way and one round later. `[data-thesis-text] h2` states the board's 18 / **700** / 1.4
        // (R59 · T2), and this local utility is Tailwind's 600 — measured on the real body through the
        // local dev server: the heading computed **weight 600** while the rule said 700 and the case,
        // which reads the RULE, was green over it.
        //
        // WHY THE BROWSER CHECK THAT ROUND MISSED IT: the probe injected a bare `<h2>` carrying no class,
        // so it measured the rule rather than what the renderer emits. **A probe that does not carry the
        // classes the code writes is measuring a different element.** The region owns the weight.
        push(<Tag key={key}>{closed.children}</Tag>);
      }
      return;
    }
    if (token.type === 'fence' || token.type === 'code_block') {
      push(
        <pre key={key} dir="ltr" className="overflow-x-auto rounded bg-paper-deep p-3 text-sm">
          <code>{token.content}</code>
        </pre>,
      );
      return;
    }
    if (token.type === 'hr') push(<hr key={key} />);
  });
  return out;
}

/** The researcher's Markdown as React, with every citation token a chip where it stands. */
export function markdownToReact(text: string, options: MarkdownOptions): ReactNode[] {
  return blocks(markdown.parse(text, {}), options);
}
