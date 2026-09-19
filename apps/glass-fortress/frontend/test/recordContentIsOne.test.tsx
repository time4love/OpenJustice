import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { renderWithIntl, textNodes, type Locale } from './render';
import { MESSAGES, messageCatalogs, requireSubjects, SRC, sourceFiles, stringsIn } from './scan';
import { parseThesisBody } from '../src/lib/thesisBody';
import { EvidenceRecordPane } from '../src/components/thesis/RecordPane';
import { RecordSheetTab, recordIdOf } from '../src/components/corpus/RecordSheet';
import { RightPane, TabsProvider } from '../src/components/shell/RightPane';
import published from './fixtures/thesis/published.json';
import { corpusStream } from './fixtures/corpus/stream';
import type { EvidenceCitation } from '../src/types/thesis';
import type { CorpusEntry, DiffEntry } from '../src/types/corpus';
import type { ChunkSide } from '../src/types/record';

// ---------------------------------------------------------------------------
// record-content-is-one — docs/gf-ui-flows.md §26 clause (1) as REPLACED 2026-09-19 by the cold design
// review the researcher accepted whole ("ONE COMPONENT IS `RecordContent`, NOT THIS PANE"), and the UI
// plan's :555 ("the step carries a repair it did not create").
//
// WHAT IT HOLDS, AND WHY EACH HALF IS NEEDED. The design's ruling is that ONE component draws a record's
// bytes on BOTH surfaces. A case that only checked the thesis pane would be satisfied by two components
// that happened to agree today; a case that only checked the corpus sheet would be satisfied by the
// surface that never drew a side label at all. So both are rendered, from their OWN fixtures, and the
// SAME two words are demanded of each.
//
// THE DEFECT THIS WAS WRITTEN AGAINST, stated so the assertion cannot outlive it. `RecordPane.tsx`
// labelled a chunk `chunk.side === 'before' ? t('before') : t('after')`, while the backend writes
// `'REMOVED' | 'ADDED'` (`recordDiff.ts` :161, :269). Every chunk of a cited diff therefore read „אחרי" —
// INCLUDING the removed one, which is the half a reader most needs. It was invisible three ways at once:
// `publishedThesis.ts` :162 widened `side` to `string` so `tsc` could not see it, the live published
// thesis cites three captures and no diffs so no reader met it, and SIX thesis fixtures carried the same
// wrong vocabulary as the code — so 313 green cases said nothing.
//
// THE FLOOR IS TWO-SIDED, AND THAT IS THE LESSON AND NOT A FLOURISH. The defect was ONE-SIDED: everything
// rendered „אחרי". A floor demanding "the fixture has at least one chunk" is met by a fixture holding one
// ADDED chunk, which renders „אחרי" correctly BY ACCIDENT and witnesses nothing. So RC-1 demands BOTH
// sides, prints the set it found, and every case below reads through it.
// ---------------------------------------------------------------------------

const LOCALES: readonly Locale[] = ['he', 'en'];

/** The two words, by locale, read from the catalogs rather than spelled here — a case must not restate copy. */
function sideWords(locale: Locale): { removed: string; added: string } {
  const catalog = messageCatalogs().find((candidate) => candidate.locale === locale);
  if (catalog === undefined) throw new Error(`no messages/${locale}.json`);
  const record = (catalog.messages as { record?: { before?: unknown; after?: unknown } }).record;
  if (typeof record?.before !== 'string' || typeof record.after !== 'string') {
    throw new Error(`messages/${locale}.json has no record.before / record.after — the two side words have no neutral home`);
  }
  return { removed: record.before, added: record.after };
}

/** The fixture's DIFF citation, through the page's own parser — never hand-built. */
function diffCitation(): EvidenceCitation {
  const body = parseThesisBody(published);
  if ('withdrawn' in body) throw new Error('published.json parsed as a withdrawal notice, which cites nothing');
  const citations = [...requireSubjects('citations of published.json', body.citations)];
  const diff = citations.find((citation): citation is EvidenceCitation => citation.kind === 'EVIDENCE' && citation.content.kind === 'DIFF');
  if (diff === undefined) throw new Error('published.json carries no DIFF citation — the fixture cannot witness a side label');
  return diff;
}

/** The corpus fixture's diff row that carries BOTH sides — the sheet's subject, chosen by the same floor. */
function diffRow(): DiffEntry {
  const rows = [...requireSubjects('entries of the corpus stream fixture', corpusStream.entries)];
  const both = rows.find(
    (entry): entry is DiffEntry =>
      entry.kind === 'DIFF' &&
      entry.current !== null &&
      entry.current.chunks.some((chunk) => chunk.side === 'REMOVED') &&
      entry.current.chunks.some((chunk) => chunk.side === 'ADDED'),
  );
  if (both === undefined) throw new Error('the corpus stream fixture holds no diff carrying BOTH sides — it cannot witness a one-sided defect');
  return both;
}

/** The corpus sheet, in the shell that draws a declared tab's content — what a reader actually sees. */
function renderSheet(entry: CorpusEntry, locale: Locale): HTMLElement {
  const entries: readonly CorpusEntry[] = [entry];
  const { container } = renderWithIntl(
    <TabsProvider>
      <RecordSheetTab entries={entries} openId={recordIdOf(entry)} />
      <RightPane />
    </TabsProvider>,
    { locale },
  );
  const panel = container.querySelector('[role="tabpanel"]');
  if (panel === null) throw new Error('the corpus sheet declared no tab panel — nothing was drawn to read');
  return panel as HTMLElement;
}

describe('record-content-is-one', () => {
  it('RC-1 THE FLOOR, TWO-SIDED: both fixtures carry a diff whose chunks hold BOTH sides, in the vocabulary the backend writes', () => {
    const citation = diffCitation();
    if (citation.content.kind !== 'DIFF') throw new Error('unreachable: diffCitation returns a DIFF');
    const thesisSides = citation.content.chunks.map((chunk) => chunk.side);
    const row = diffRow();
    const corpusSides = (row.current?.chunks ?? []).map((chunk) => chunk.side);

    console.log(
      `record-content-is-one: published.json's diff citation carries ${String(thesisSides.length)} chunks [${thesisSides.join(' · ')}]; ` +
        `the corpus fixture's diff row carries ${String(corpusSides.length)} chunks [${corpusSides.join(' · ')}]`,
    );

    // A ONE-SIDED FIXTURE CANNOT WITNESS A ONE-SIDED DEFECT — both sides, on both surfaces, or the cases below prove nothing.
    expect(thesisSides).toContain('REMOVED');
    expect(thesisSides).toContain('ADDED');
    expect(corpusSides).toContain('REMOVED');
    expect(corpusSides).toContain('ADDED');
    // And the retired vocabulary is gone from the fixture, not merely joined by the new one.
    expect(thesisSides).not.toContain('before');
    expect(thesisSides).not.toContain('after');

    // THE ANTI-PARITY FLOOR, AND IT WAS FOUND BY A DECOY THAT REDDENED NOTHING. A mapping by chunk INDEX
    // PARITY — `index % 2 === 0 ? before : after`, which ignores the side entirely — passed every case
    // above at 5/5, because both fixtures held exactly [REMOVED, ADDED] and position happened to agree with
    // side. That is an UNEXERCISED REGION, not a pass: no case could tell a component that reads the side
    // from one that counts. Both fixtures now carry TWO removed and ONE added, which is the shape the real
    // backend emits (`recordDiff.ts` spreads all removed then all added, and the real corpus's 6.3→17.3
    // change is "2 נגרעו · 1 נוספו"), so position and side DISAGREE and the probe bites.
    //
    // THE FLOOR IS HERE RATHER THAN ONLY IN THE FIXTURE so a later seat tidying the fixture back to one
    // chunk a side gets this sentence instead of a silent loss of the property.
    for (const sides of [thesisSides, corpusSides]) {
      const alternates = sides.every((side, index) => index === 0 || side !== sides[index - 1]);
      expect(alternates).toBe(false);
    }
  });

  it('RC-2 THE THESIS PANE labels a REMOVED chunk with the BEFORE word and an ADDED chunk with the AFTER word, and the two DIFFER', () => {
    for (const locale of LOCALES) {
      const citation = diffCitation();
      if (citation.content.kind !== 'DIFF') throw new Error('unreachable: diffCitation returns a DIFF');
      const words = sideWords(locale);
      const { container } = renderWithIntl(<EvidenceRecordPane citation={citation} source="#ev_fixture" locale={locale} />, { locale });
      const text = textNodes(container).map((node) => node.data.trim());

      // THE VALUE, NOT THE PROPERTY NAME: the words come from the catalog and the chunk TEXTS are matched to
      // the label drawn above them, so a component that drew both labels but swapped them still fails.
      const labelled = citation.content.chunks.map((chunk) => {
        const body = [...container.querySelectorAll('.record-captured')].find((element) => (element.textContent ?? '').trim() === chunk.text);
        if (body === undefined) throw new Error(`${locale}: the pane drew no .record-captured holding the ${chunk.side} chunk's text`);
        const register = body.previousElementSibling;
        return { side: chunk.side, label: (register?.textContent ?? '').trim() };
      });

      for (const { side, label } of labelled) {
        expect(label).toBe(side === 'REMOVED' ? words.removed : words.added);
      }
      // TWO DISTINCT LABELS: the defect rendered ONE word for every chunk, so sameness is the failure to name.
      expect(new Set(labelled.map((entry) => entry.label)).size).toBe(2);
      expect(text).toContain(words.removed);
      expect(text).toContain(words.added);
    }
  });

  it('RC-3 THE CORPUS SHEET draws the SAME two words for the same two sides — one component, §26 clause (1)', () => {
    for (const locale of LOCALES) {
      const row = diffRow();
      const words = sideWords(locale);
      const panel = renderSheet(row, locale);
      const text = textNodes(panel).map((node) => node.data.trim());

      const labelled = (row.current?.chunks ?? []).map((chunk) => {
        const body = [...panel.querySelectorAll('.record-captured')].find((element) => (element.textContent ?? '').trim() === chunk.text);
        if (body === undefined) throw new Error(`${locale}: the sheet drew no .record-captured holding the ${chunk.side} chunk's text`);
        return { side: chunk.side, label: (body.previousElementSibling?.textContent ?? '').trim() };
      });

      for (const { side, label } of labelled) {
        expect(label).toBe(side === 'REMOVED' ? words.removed : words.added);
      }
      expect(text).toContain(words.removed);
      expect(text).toContain(words.added);
    }
  });

  it('RC-4 NO FILE under src/ COMPARES a chunk side against the RETIRED words — the mapping is made once, and correctly', () => {
    // WHY THIS READS COMPARISONS AND NOT STRINGS, written because the first draft of this case got it wrong
    // and was RED on correct code. `record.before` / `record.after` are the MESSAGE KEYS the researcher ruled
    // (option (b), 2026-09-19), so the bare literals `'before'` and `'after'` appear legitimately in
    // `t('before')`. A scan on the literal alone cannot tell a KEY from a retired SIDE VALUE — and a case
    // that cannot tell them apart would force the code to be wrong to stay green, which is the worst kind of
    // instrument. What is actually forbidden is COMPARING a side to those words, so that is what is read.
    const files = sourceFiles(SRC, ['.ts', '.tsx']);
    const naming = [
      ...requireSubjects(
        'files under src/ naming a chunk side',
        files.filter((file) => stringsIn(file).some((string) => string.text === 'REMOVED' || string.text === 'ADDED')),
      ),
    ];
    // A FLOOR: the record component, the corpus sheet and the two parsers all name a side. Fewer means the
    // subjects moved out from under the scan rather than the property holding.
    expect(naming.length).toBeGreaterThanOrEqual(3);

    const RETIRED = new Set(['before', 'after']);
    const offenders: string[] = [];
    for (const file of files) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
      const visit = (node: ts.Node): void => {
        if (
          ts.isBinaryExpression(node) &&
          (node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken || node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken)
        ) {
          for (const [side, other] of [
            [node.left, node.right],
            [node.right, node.left],
          ] as const) {
            // A comparison of SOMETHING NAMED `side` against a retired word — the exact shape of the defect.
            if (ts.isStringLiteral(side) && RETIRED.has(side.text) && /\bside\b/i.test(other.getText(source))) {
              offenders.push(`${file.slice(SRC.length + 1)}:${String(source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1)} — ${node.getText(source)}`);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    console.log(`record-content-is-one: ${String(naming.length)} files under src/ name a chunk side; ${String(offenders.length)} compare one against the retired vocabulary`);
    expect(offenders).toEqual([]);
  });

  it('RC-5 THE TWO SIDE WORDS HAVE ONE NEUTRAL HOME, and the approved text is byte-identical to what it was', () => {
    // The researcher's ruling of 2026-09-19 on option (b): the KEY moves, the TEXT does not. Held BY VALUE —
    // a case asserting only that `record.before` exists is satisfied by a key holding the wrong words.
    const APPROVED: Record<Locale, { before: string; after: string }> = {
      he: { before: 'לפני', after: 'אחרי' },
      en: { before: 'Before', after: 'After' },
    };
    for (const locale of LOCALES) {
      const words = sideWords(locale);
      expect(words.removed).toBe(APPROVED[locale].before);
      expect(words.added).toBe(APPROVED[locale].after);

      const catalog = messageCatalogs().find((candidate) => candidate.locale === locale);
      const sheet = (catalog?.messages as { theses?: { sheet?: Record<string, unknown> } }).theses?.sheet ?? {};
      // THE OLD HOME IS GONE, not merely shadowed: two keys holding one approved string is the orphaned-copy
      // defect waiting to drift apart.
      expect(Object.keys(sheet)).not.toContain('before');
      expect(Object.keys(sheet)).not.toContain('after');
    }
    console.log(`record-content-is-one: the side words live at record.before / record.after in ${String(LOCALES.length)} catalogs under ${MESSAGES.slice(MESSAGES.lastIndexOf('/') + 1)}/`);
  });

  it('RC-6 A THIRD SIDE MAKES THE RENDER THROW — it is never drawn as one of the two', () => {
    // WHY A THROW AND NOT A FALLBACK. A ternary answers EVERY value that is not its one comparand with the
    // other branch, so a third side would be drawn as „אחרי" — a wrong label a reader cannot tell from a
    // right one, which is the exact defect this instrument was written against. A lookup keyed by the side
    // has no such branch: an unknown key is ABSENT, and absence is refusable.
    //
    // THE CAST IS THE POINT AND IS CONFINED TO THIS CASE. Both parsers narrow `side` at the boundary
    // (`lib/thesisBody.ts`' `recordChunk`, `lib/corpusBody.ts`' `chunk`), so a third side cannot arrive
    // through a read — which is precisely why nothing else can witness this, and why the case reaches past
    // the type to prove the component refuses rather than trusting that it is never asked.
    const citation = diffCitation();
    if (citation.content.kind !== 'DIFF') throw new Error('unreachable: diffCitation returns a DIFF');
    const chunks = citation.content.chunks.map((chunk, index) =>
      index === 0 ? ({ side: 'SIDEWAYS' as unknown as ChunkSide, text: chunk.text }) : chunk,
    );
    const forged: EvidenceCitation = { ...citation, content: { kind: 'DIFF', chunks } };

    // THE FLOOR: the forged chunk must still be one of several, so a throw cannot come from an empty render.
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    console.log(`record-content-is-one: rendering a diff whose first chunk's side is [${String(chunks[0]?.side)}] — the component must refuse it`);

    expect(() => renderWithIntl(<EvidenceRecordPane citation={forged} source="#ev_fixture" locale="he" />, { locale: 'he' })).toThrow(/SIDEWAYS/);
  });
});
