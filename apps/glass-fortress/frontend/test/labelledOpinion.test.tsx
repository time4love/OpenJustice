import { join, relative } from 'node:path';
import { LabelledOpinion } from '@/components/opinion/LabelledOpinion';
import { renderWithIntl, textNodes, type Locale } from './render';
import { FRONTEND, SRC, importsOf, requireSubjects, sourceFiles } from './scan';
import { classifierOpinion } from './fixtures/corpus/opinion';
import he from '../messages/he.json';
import en from '../messages/en.json';

// ---------------------------------------------------------------------------
// opinion-labelled-on-corpus — docs/gf-ui-flows.md §10 :381–:384 (the MODEL's voice: "ALWAYS inside a
// container that carries COMPLIANCE.md rule 3's label … with the model and prompt version beside it. Never
// outside one"), §24 :663–:669 (clamped to two lines, NOT a chip) and :690–:692 (the corpus's ONE public
// model voice); evidence A4 :1086–:1087; docs/gf-ui-refactor-plan.md UI-7 :592–:596.
//
// THE INSTRUMENT LANDED IN TWO PARTS BECAUSE ITS SUBJECTS DID. The arms below render the container DIRECTLY,
// where the subject is real and cannot be empty. What the plan describes — "every rendered `opinion` field
// descends from it, and no other model field is rendered on a public corpus page" — needs a page that renders
// one, and until chunk 5a there was none; that arm now lives in `corpusStream.test.tsx`, beside the stream
// that gave it subjects. The last case here held the floor at ZERO while that was true, as a tripwire rather
// than a silence, and moved off zero in the same edit that made it false.
//
// WHAT NO CASE HERE HOLDS, said rather than implied: jsdom computes no layout, so nothing below can witness
// that the opinion shows TWO LINES. The clamp is asserted STRUCTURALLY — the class is on the element that
// holds the text — and the two-line reading is a browser exercise at 375px, recorded in the step's dated doc.
// The half these cases can hold is the half that matters for a lie: the FULL string is in the DOM, so a
// reveal control added at chunk 5 has something to reveal, and a clamp that had truncated the markup instead
// would make that control a promise the element could not keep.
// ---------------------------------------------------------------------------

/** The container's own path, named once — the scan below must not count it as its own importer. */
const CONTAINER = 'src/components/opinion/LabelledOpinion.tsx';

/** COMPLIANCE.md :68–:69, verbatim. Written here as VALUES, so the catalogue cannot drift from the rule. */
const RULE_3 = {
  he: 'ניתוח AI — אינו מהווה קביעה שיפוטית',
  en: 'AI Analysis — does not constitute a judicial finding',
} as const;

function render(locale: Locale) {
  return renderWithIntl(<LabelledOpinion opinion={classifierOpinion} />, { locale });
}

describe('opinion-labelled-on-corpus', () => {
  it("THE LABEL IS COMPLIANCE.md RULE 3'S WORDS, VERBATIM, IN BOTH LOCALES — and INSIDE the container, never beside it", () => {
    // BY VALUE AND BY ANCESTRY, because a case that only asked "are the words on the page" is satisfied by a
    // label printed as plain text OUTSIDE the container — which is precisely the shape rule 3 forbids, since
    // a label that is not wrapped around the opinion labels nothing.
    const readings = (['he', 'en'] as const).map((locale) => {
      const { container, unmount } = render(locale);
      try {
        const box = container.querySelector('[data-labelled-opinion]');
        const label = container.querySelector('[data-opinion-label]');
        return {
          locale,
          text: (label?.textContent ?? '').includes(RULE_3[locale]),
          insideTheContainer: label !== null && box !== null && box.contains(label),
          // The catalogue is the other half of the same fact: the page renders what the rule says only if the
          // string it reads IS the rule's.
          catalogue: (locale === 'he' ? he : en).opinion.label === RULE_3[locale],
        };
      } finally {
        unmount();
      }
    });
    expect(readings).toEqual([
      { locale: 'he', text: true, insideTheContainer: true, catalogue: true },
      { locale: 'en', text: true, insideTheContainer: true, catalogue: true },
    ]);
  });

  it('THE VERSION IS RENDERED BESIDE THE LABEL AND IS BIDI-ISOLATED — §10 :383 asks for it, and it is Latin inside Hebrew', () => {
    const { container } = render('he');
    const version = container.querySelector('[data-opinion-version]');
    const label = container.querySelector('[data-opinion-label]');
    expect({
      value: (version?.textContent ?? '').trim(),
      // "Beside it" is a structural claim: the version sits inside the label's own line, not in the body.
      besideTheLabel: label !== null && version !== null && label.contains(version),
      // `bidi-isolated`'s rule, held here for this element: a Latin run inside a Hebrew line reorders the
      // punctuation around it unless it is isolated.
      isolated: version?.closest('bdi') !== null || version?.tagName === 'BDI',
      dir: version?.getAttribute('dir') ?? version?.closest('bdi')?.getAttribute('dir') ?? null,
    }).toEqual({ value: 'v5-editorial-verdict', besideTheLabel: true, isolated: true, dir: 'ltr' });
  });

  it('THE WHOLE OPINION IS IN THE DOM AND THE CLAMP IS ONLY A CLASS — a clamp that cut the markup would make a reveal a lie', () => {
    const { container } = render('he');
    const body = container.querySelector('[data-opinion-body]');
    const shown = (body?.textContent ?? '').trim();
    expect({
      // THE VALUE, not a prefix of it: the fixture's `significance` is 210 characters, longer than the 197 the
      // researcher measured on the real corpus, and every one of them is here.
      whole: shown === classifierOpinion.significance,
      length: shown.length,
      // STRUCTURAL ONLY. That this renders as two lines is a BROWSER reading; what a case can hold is that the
      // element carrying the text is the one carrying the clamp.
      clampedElementHoldsTheText: (body?.className ?? '').includes('line-clamp-2'),
    }).toEqual({ whole: true, length: 210, clampedElementHoldsTheText: true });
  });

  it('NOTHING THE MODEL SAID IS RENDERED OUTSIDE THE CONTAINER — §10 :384, "Never outside one"', () => {
    // The strongest form available to a direct render: every text node in the document that carries any of the
    // model's own words must have the container as an ancestor. A label or a sentence printed beside the box
    // fails here even though "the words are present" would pass.
    const { container } = render('he');
    const box = container.querySelector('[data-labelled-opinion]');
    const modelWords = [RULE_3.he, classifierOpinion.significance, classifierOpinion.classifierVersion];
    const escaped = textNodes(container)
      .filter((node) => modelWords.some((word) => node.data.includes(word)))
      .filter((node) => box === null || !box.contains(node))
      .map((node) => node.data.slice(0, 40));
    expect({
      escaped,
      // THE FLOOR: the reader really did run over the model's words. Without it an empty document passes.
      examined: textNodes(container).filter((node) => modelWords.some((word) => node.data.includes(word))).length,
    }).toEqual({ escaped: [], examined: 3 });
  });

  it('THE CONTAINER IS REACHED BY THE CORPUS SURFACE AND BY NOTHING ELSE — the floor moved off zero when the stream landed', () => {
    // THIS CASE ASSERTED ZERO UNTIL THE STREAM LANDED, deliberately: the instrument's corpus-wide arm needs a
    // page that renders an opinion, and until chunk 5a there was none, so a scan would have passed over an
    // empty set. The zero was written as a TRIPWIRE rather than a silence — "the day a page imports the
    // container, this case reddens" — and it did exactly that. What it holds now is the set BY NAME: the
    // stream reaches the container, and nothing else does. A second importer is either UI-8's read view
    // arriving (which renders the same component and belongs here) or the model's voice escaping to a surface
    // that has not been argued for, and either way it should be read before it lands.
    // ASKED OF IMPORTS, NOT OF CLOSURES, and that is not a shortcut: if NO module imports the container at
    // all, no closure can contain it, so the direct question answers the transitive one exactly. It also
    // avoids a trap this case hit while being written — `importClosureOf` carries its own vacuity guard and
    // THROWS on a file that legitimately imports nothing (`app/[locale]/opengraph-image.tsx` is one), so a
    // closure mapped blindly over every page fails for a reason that has nothing to do with the property.
    const modules = requireSubjects(
      'source files under src/',
      sourceFiles(SRC, ['.ts', '.tsx']).map((file) => relative(FRONTEND, file)),
    );
    const importers = modules.filter((file) =>
      file !== CONTAINER &&
      importsOf(join(FRONTEND, file)).some((found) => `${found.module ?? ''} ${found.specifier}`.includes('components/opinion')),
    );
    expect({ modulesScanned: modules.length > 50, containerExists: modules.includes(CONTAINER), importers }).toEqual({
      modulesScanned: true,
      containerExists: true,
      // THE SHEET JOINS THE STREAM as a legal importer at chunk 5b(b), and the reason is §24 region 4's own:
      // the stream CLAMPS the opinion to two lines and "the rest [is] in the sheet", so the sheet renders the
      // same field in full. It is the SAME container either way — which is exactly what this case exists to
      // hold — so the set grows by one surface rather than the rule loosening. Every entry still offends:
      // each really does import the container, checked by this same scan.
      //
      // THE DIFF PAGE JOINS THEM at chunk 2c (2026-09-20), and it is the tripwire working rather than the
      // rule bending. `get_diff_input` gained the diff row's `opinion` by the researcher's ruling (A4
      // :1096) precisely so ui §26 :852–:856's "the opinion labelled" could be drawn there — the SAME
      // field, from the SAME builder, inside the SAME container. A surface showing the model's voice
      // outside `LabelledOpinion`, or a fourth importer nobody argued for, still reddens this case.
      importers: [
        'src/app/[locale]/pages/[trackedUrlId]/diffs/[before]/[after]/page.tsx',
        'src/components/corpus/RecordSheet.tsx',
        'src/components/corpus/Stream.tsx',
      ],
    });
  });
});
