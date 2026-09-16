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
// wrapped in `<bdi dir="ltr">`. The patterns live here, once, and the instrument reads them from here.
// ---------------------------------------------------------------------------

const markdown = new MarkdownIt('commonmark', { html: false, linkify: false, typographer: false });

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

/** One inline token stream (`token.children`) as React nodes. */
function inlineNodes(children: readonly Token[], key: string, options: MarkdownOptions): ReactNode[] {
  const nodes: ReactNode[] = [];
  let openLink: { href: string; children: ReactNode[] } | null = null;
  const push = (node: ReactNode): void => {
    if (openLink === null) nodes.push(node);
    else openLink.children.push(node);
  };
  children.forEach((token, index) => {
    const at = `${key}-${String(index)}`;
    switch (token.type) {
      case 'text':
        push(<Fragment key={at}>{inlineText(token.content, at, options)}</Fragment>);
        break;
      case 'code_inline':
        push(
          <code key={at} dir="ltr" className="rounded bg-slate-100 px-1 text-sm">
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
      case 'strong_open':
      case 'em_open':
      case 's_open':
      case 'strong_close':
      case 'em_close':
      case 's_close':
        break;
      case 'link_open':
        openLink = { href: token.attrGet('href') ?? '', children: [] };
        break;
      case 'link_close': {
        const link = openLink;
        openLink = null;
        if (link !== null) {
          nodes.push(
            <a key={at} href={link.href} rel="noopener noreferrer nofollow" target="_blank" className="underline">
              {link.children}
            </a>,
          );
        }
        break;
      }
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

/** The block tokens as React elements, in document order. */
function blocks(tokens: readonly Token[], options: MarkdownOptions): ReactNode[] {
  const out: ReactNode[] = [];
  const stack: { tag: string; children: ReactNode[] }[] = [];
  const push = (node: ReactNode): void => {
    const open = stack.at(-1);
    if (open === undefined) out.push(node);
    else open.children.push(node);
  };

  tokens.forEach((token, index) => {
    const key = `b${String(index)}`;
    if (token.type.endsWith('_open') && ['bullet_list', 'ordered_list', 'list_item', 'blockquote'].some((name) => token.type === `${name}_open`)) {
      stack.push({ tag: token.tag, children: [] });
      return;
    }
    if (token.type.endsWith('_close') && ['bullet_list', 'ordered_list', 'list_item', 'blockquote'].some((name) => token.type === `${name}_close`)) {
      const closed = stack.pop();
      if (closed === undefined) return;
      const Tag = closed.tag as 'ul' | 'ol' | 'li' | 'blockquote';
      push(
        <Tag key={key} className={Tag === 'ul' ? 'list-disc ps-6' : Tag === 'ol' ? 'list-decimal ps-6' : undefined}>
          {closed.children}
        </Tag>,
      );
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
        push(
          <Tag key={key} className={Tag === 'p' ? 'leading-relaxed' : 'font-semibold'}>
            {closed.children}
          </Tag>,
        );
      }
      return;
    }
    if (token.type === 'fence' || token.type === 'code_block') {
      push(
        <pre key={key} dir="ltr" className="overflow-x-auto rounded bg-slate-100 p-3 text-sm">
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
