import { markdownToReact } from '@/lib/markdownToReact';
import { ResearcherWords } from './ResearcherWords';

/**
 * THE RESEARCHER'S PROSE — their voice, rendered through their own Markdown.
 *
 * docs/gf-ui-flows.md §16 :521 as amended 2026-09-18 (the researcher): *"the researcher's VOICE renders THEIR
 * MARKDOWN wherever it appears — the public-interest statement, the publication rationale, the intake line and
 * every appeal field — through the ONE renderer §17 :538 names, because the text is drafted with a model in
 * claude.ai and a capability dropped is a sentence the researcher wrote and no reader sees."*
 *
 * ONE RULE, ONE IMPLEMENTATION. Until this component `markdownToReact` had a single caller, `ThesisText.tsx`,
 * so the published TEXT rendered every capability and the other TEN fields of the same voice rendered none —
 * the live rationale is 2,632 characters over three blank-line breaks and reached the reader as one run-on
 * block. The rule lives HERE rather than at the ten call sites, because ten spellings of one rule is this
 * repository's dominant defect shape and the ninth is the one that would drift.
 *
 * IT IS NOT `ResearcherWords`, AND THE DIFFERENCE IS THE ARCHIVE. That component is the voice's FACE and is
 * also — wrongly, and reported rather than fixed here — worn by `RecordPane`'s captured text, diff chunks and
 * trajectory claim text. Those are THE ARCHIVE'S BYTES and §16 :521 forbids parsing them: a `#` or a `*`
 * standing in a captured page would re-interpret what the record says, which is an evidence change wearing a
 * display change's clothes. So the Markdown rule attaches to PROSE, which the archive is not, and the record
 * pane is untouched.
 *
 * A CITATION TOKEN RENDERS AS NOTHING HERE, on the exact precedent of `ThesisText.tsx` :38–:40's `#doc_`
 * branch and for the same reason: §17 :538 gives chips to THE TEXT, which resolves them against the body's
 * mentions; these ten fields carry no resolved citations, so a token could only reach a reader as its own
 * `0x…` name — an id shown as text, which §4 :167 forbids outright. Dropping it is a deliberate, cased
 * decision about a construct the contract does not give these fields, not a silently dropped capability.
 */
export function ResearcherProse({ text, className, links }: { text: string; className?: string; links?: 'anchor' | 'text' }) {
  // `md-prose` carries the SPACING between the blocks the parser produced. Without it four
  // paragraphs render flush and read as one block — the structure right and invisible.
  return (
    <ResearcherWords className={className === undefined ? 'md-prose' : `md-prose ${className}`}>
      {markdownToReact(text, { chip: () => null, links })}
    </ResearcherWords>
  );
}
