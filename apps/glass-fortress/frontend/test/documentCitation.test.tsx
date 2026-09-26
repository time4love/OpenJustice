jest.mock('../src/lib/api', () => jest.requireActual<typeof import('./render')>('./render').apiDouble());
jest.mock('next/navigation', () => jest.requireActual<typeof import('./render')>('./render').navigationDouble());

import { TabsProvider } from '@/components/shell/RightPane';
import { recordTabs } from '@/components/thesis/PaneTabs';
import { ThesisText } from '@/components/thesis/ThesisText';
import { TickLine } from '@/components/thesis/TickLine';
import { parseDebate, parseEvidenceReviews, parseThesisContext, parseThesisReviews } from '@/lib/researchBody';
import { citation } from '@/lib/thesisBody';
import type { ThesisContext, ThesisOwedEntry } from '@/types/research';
import type { Citation } from '@/types/thesis';
import debateDocument from './fixtures/research/debate-document.json';
import { DOC_COMMITMENT, DOC_PIN, DOC_TITLE, documentMention, thesisContextDocument } from './fixtures/research/documentContext';
import { evidenceReviews, thesisReviewsOwed } from './fixtures/research/reads';
import { renderPage, renderResearchThesis, renderWithIntl, setAuthState, setPathname, setPublicBodies } from './render';
import published from './fixtures/thesis/published.json';

// ---------------------------------------------------------------------------
// THE `#doc_` CITATION ON THE PAGE — document step 33 chunk 6: every wire arm step 33 added, PARSED; the chip of board
// י4 and ד2·י, DRAWN. ui §17 :540 as ruled 2026-09-22; thesis A4 :1476 (R81 QA, QB, QC; QA as conformed R82); evidence
// A4 :1123, :1144, :1146 (QB).
//
// Every invariant is asserted off the PARSE or the RENDER, never off a fixture literal (R65's trap).
// ---------------------------------------------------------------------------

/** What the wire does to a body before a parser sees it. */
const overTheWire = (value: unknown): unknown => JSON.parse(JSON.stringify(value)) as unknown;
const FIRST_FOUR = DOC_TITLE.split(/\s+/).slice(0, 4).join(' ');

describe('PARSE — the DOCUMENT arm of V.mentions (thesis A4 :1476, R81 QC)', () => {
  it('P1 every field of the arm is read, and the key set is exactly the appendix’s', () => {
    const parsed = citation(overTheWire(documentMention({ verified: true, argued: true })), 'mention');
    expect(parsed).toEqual({
      kind: 'DOCUMENT',
      name: DOC_COMMITMENT,
      pin: DOC_PIN,
      argued: true,
      title: DOC_TITLE,
      custody: 'HELD',
      verified: true,
      flag: { flagged: false, reasons: [] },
      overObjection: false,
    });
    expect(Object.keys(parsed).sort()).toEqual(['argued', 'custody', 'flag', 'kind', 'name', 'overObjection', 'pin', 'title', 'verified']);
    // A SEALED document with no title (step 32's door): `null` is an answer.
    expect(citation(overTheWire(documentMention({ custody: 'SEALED', title: null })), 'mention')).toMatchObject({ custody: 'SEALED', title: null });
  });

  it('P2 a member that is GONE or outside its union NAMES ITSELF — never defaulted, never drawn as nothing', () => {
    const without = (key: string) => {
      const row = overTheWire(documentMention()) as Record<string, unknown>;
      delete row[key];
      return row;
    };
    expect(() => citation(without('title'), 'mention')).toThrow('mention.title');
    expect(() => citation(without('verified'), 'mention')).toThrow('mention.verified');
    expect(() => citation(without('flag'), 'mention')).toThrow('mention.flag');
    expect(() => citation({ ...(overTheWire(documentMention()) as object), custody: 'NONE' }, 'mention')).toThrow('mention.custody');
    // And the kind vocabulary is closed: a fourth word is refused, naming the path.
    expect(() => citation({ ...(overTheWire(documentMention()) as object), kind: 'EXHIBIT' }, 'mention')).toThrow("'EVIDENCE', 'TRAJECTORY' or 'DOCUMENT'");
  });

  it('P3 the working view’s body parses with the DOCUMENT arm beside a capture’s — no arm dropped', () => {
    const parsed = parseThesisContext(overTheWire(thesisContextDocument));
    expect(parsed.head?.mentions.map((mention) => mention.kind)).toEqual(['EVIDENCE', 'DOCUMENT']);
  });
});

describe('PARSE — the debate’s third record and its audited assertions (R81 QA, QB), from the REAL answer', () => {
  it('P4 get_debate’s record is { commitment, title }; DEBATE_OPENED names it and its line is the TITLE', () => {
    const parsed = parseDebate(overTheWire(debateDocument));
    expect(parsed.record).toEqual({ commitment: DOC_COMMITMENT, title: 'חוזר המנכ״ל' });
    const opened = parsed.turns.find((turn) => turn.kind === 'DEBATE_OPENED');
    expect(opened?.line).toBe('חוזר המנכ״ל');
    expect(opened?.kind === 'DEBATE_OPENED' ? opened.body.record : undefined).toEqual({ commitment: DOC_COMMITMENT, title: 'חוזר המנכ״ל' });
  });

  it('P5 ASSESSMENT carries the assertions, five fields each, and the MODEL voice its model and prompt version', () => {
    const assessment = parseDebate(overTheWire(debateDocument)).turns.find((turn) => turn.kind === 'ASSESSMENT');
    if (assessment?.kind !== 'ASSESSMENT') throw new Error('the real answer carries no ASSESSMENT turn');
    expect(assessment.body.assertions?.map((one) => [one.quoteVerified, one.phraseVerified, one.phraseVerifiedReason])).toEqual([
      [true, 'PRESENT', null],
      [false, 'ABSENT', null],
    ]);
    expect(Object.keys(assessment.body.assertions?.at(0) ?? {}).sort()).toEqual([
      'phraseVerified', 'phraseVerifiedReason', 'quoteVerified', 'researcherClaim', 'whatEvidenceShows',
    ]);
    expect(assessment.by).toMatchObject({ voice: 'MODEL', model: 'gemini:gemini-flash-latest', promptVersion: 'v2-document-record-and-assertions' });
  });

  it('P6 `assertions` is NULL on an older row, `[]` stays `[]`, an ABSENT key names itself, and a fourth verdict is refused', () => {
    const withAssertions = (value: unknown) => {
      const body = overTheWire(debateDocument) as { turns: { kind: string; body: Record<string, unknown> }[] };
      const turn = body.turns.find((one) => one.kind === 'ASSESSMENT');
      if (turn === undefined) throw new Error('no ASSESSMENT turn');
      if (value === undefined) delete turn.body.assertions;
      else turn.body.assertions = value;
      return parseDebate(body).turns.find((one) => one.kind === 'ASSESSMENT');
    };
    const assertionsOf = (value: unknown) => {
      const turn = withAssertions(value);
      return turn?.kind === 'ASSESSMENT' ? turn.body.assertions : 'no turn';
    };
    expect(assertionsOf(null)).toBeNull();
    expect(assertionsOf([])).toEqual([]);
    expect(() => withAssertions(undefined)).toThrow('assertions');
    expect(() => withAssertions([{ researcherClaim: 'a', quoteVerified: true, whatEvidenceShows: 'b', phraseVerified: 'MAYBE', phraseVerifiedReason: null }])).toThrow('phraseVerified');
  });

  it('P9 an assertion LACKING `phraseVerifiedReason` names the field — the fifth field is PRESENT, null only as an answer (A4 :1476 as conformed)', () => {
    const body = overTheWire(debateDocument) as { turns: { kind: string; body: Record<string, unknown> }[] };
    const turn = body.turns.find((one) => one.kind === 'ASSESSMENT');
    if (turn === undefined) throw new Error('no ASSESSMENT turn');
    turn.body.assertions = [{ researcherClaim: 'a', quoteVerified: true, whatEvidenceShows: 'b', phraseVerified: 'PRESENT' }];
    expect(() => parseDebate(body)).toThrow(/assertions\[0\]\.phraseVerifiedReason/);
  });

  it('P7 a VERSION turn’s stored DOCUMENT row parses — the fourth kind is not refused', () => {
    const parsed = parseThesisContext(overTheWire(thesisContextDocument));
    const version = parsed.history.find((turn) => turn.kind === 'VERSION');
    expect(version?.kind === 'VERSION' ? version.body.mentions.map((row) => row.kind) : []).toEqual(['EVIDENCE', 'DOCUMENT']);
  });

  it('P8 a review read’s record may be the document — list_evidence_reviews’ notEvaluable and the thesis reviews (QB)', () => {
    const reviews = parseEvidenceReviews(
      overTheWire({
        ...evidenceReviews,
        notEvaluable: [{ fileHash: DOC_COMMITMENT, record: { commitment: DOC_COMMITMENT, title: DOC_TITLE }, reason: 'AWAITING_DERIVATION', detail: 'the derivation pass owes it one' }],
      }),
    );
    expect(reviews.notEvaluable.at(0)?.record).toEqual({ commitment: DOC_COMMITMENT, title: DOC_TITLE });
    const first = thesisReviewsOwed.reviews.find((review) => review.kind === 'UNARGUED');
    if (first?.kind !== 'UNARGUED') throw new Error('the owed list holds no UNARGUED entry');
    const thesisReviews = parseThesisReviews(
      overTheWire({ ...thesisReviewsOwed, reviews: [{ ...first, material: { ...first.material, record: { commitment: DOC_COMMITMENT, title: DOC_TITLE } } }] }),
    );
    const entry = thesisReviews.reviews.at(0);
    expect(entry?.kind === 'UNARGUED' ? entry.material.record : null).toEqual({ commitment: DOC_COMMITMENT, title: DOC_TITLE });
  });
});

/** Render the text of a head citing the document with `mention` — the centre as the working view calls it. */
function renderText(mention: Citation | null, locale: 'he' | 'en' = 'he'): HTMLElement {
  const text = `מערך הנתונים שפורסם עם המאמר #doc_${DOC_COMMITMENT} מתעד את הדיווחים.`;
  return renderWithIntl(
    <TabsProvider>
      <ThesisText text={text} citations={mention === null ? [] : [mention]} pages={[]} locale={locale} />
    </TabsProvider>,
    { locale },
  ).container;
}

describe('THE CHIP — board י4 (ui §17 :540 as ruled): the glyph, the TITLE’s first words, one dot, dir from the title', () => {
  it('R1 a `#doc_` token draws the document chip — never its commitment, and not a control until step 34', () => {
    const container = renderText(documentMention());
    const chip = container.querySelector('[data-chip-kind="document"]');
    expect(chip).not.toBeNull();
    expect(chip?.querySelector('[data-tick-glyph="document"]')).not.toBeNull();
    expect(chip?.textContent).toBe(FIRST_FOUR);
    // NO ID AS TEXT (§4 :167; board ד2·י's note): the commitment is an attribute for the instruments, never a text node.
    expect(container.textContent).not.toContain(DOC_COMMITMENT);
    expect(container.textContent).not.toContain('#doc_');
    expect(chip?.getAttribute('data-chip')).toBe(DOC_COMMITMENT);
    // TAP IS RESERVED — the document sheet is step 34's (board ד2·י "not drawn"): no button to press.
    expect(chip?.querySelector('button')).toBeNull();
  });

  it('R11 the chip counts WORDS — a punctuation-only token is skipped, never counted (the real title, R82 Entry 19)', () => {
    // The staging document's own title, read off `get_thesis_context` at the page: its fourth whitespace token is an em dash.
    const title = 'קוד נירנברג (1947) — הנוסח המלא של עשרת הסעיפים';
    expect(renderText(documentMention({ title })).querySelector('[data-chip-kind="document"]')?.textContent).toBe('קוד נירנברג (1947) הנוסח');
  });

  it('R2 ONE DOT, three tones as the board draws them — flagged first, then VERIFIED(d), else neutral', () => {
    const tone = (mention: Citation) => renderText(mention).querySelector('[data-chip-kind="document"] [data-tick]')?.getAttribute('data-tick-tone');
    expect(tone(documentMention())).toBe('neutral');
    expect(tone(documentMention({ verified: true }))).toBe('verified');
    expect(tone(documentMention({ verified: true, flag: { flagged: true, reasons: ['WITHDRAWN'] } }))).toBe('flagged');
  });

  it('R3 the pill reads its direction FROM THE TITLE — `dir="auto"` on the tick and on the words', () => {
    const tick = renderText(documentMention()).querySelector('[data-chip-kind="document"] [data-tick]');
    expect(tick?.getAttribute('dir')).toBe('auto');
    expect(tick?.querySelector('bdi')?.getAttribute('dir')).toBe('auto');
  });

  it('R4 an untitled document reads "—"; a `#doc_` the body does not resolve is the unresolved STATEMENT — never nothing', () => {
    expect(renderText(documentMention({ title: null })).querySelector('[data-chip-kind="document"]')?.textContent).toBe('—');
    const unresolved = renderText(null);
    expect(unresolved.querySelector('[data-chip-kind="unresolved"]')).not.toBeNull();
    expect(unresolved.textContent).not.toContain(DOC_COMMITMENT);
  });
});

describe('THE STRIP AND THE PANE — board ד2·י', () => {
  it('R5 the document chip closes the captures strip, after the page’s dated ticks, on the same line', () => {
    const context = parseThesisContext(overTheWire(thesisContextDocument));
    const container = renderWithIntl(
      <TabsProvider>
        <TickLine citations={context.head?.mentions ?? []} locale="he" />
      </TabsProvider>,
      { locale: 'he' },
    ).container;
    const lines = container.querySelectorAll('[data-tick-line]');
    expect(lines).toHaveLength(1);
    const kinds = [...(lines[0]?.querySelectorAll('[data-chip-kind]') ?? [])].map((chip) => chip.getAttribute('data-chip-kind'));
    expect(kinds).toEqual(['capture', 'document']);
    // The document chip's COPY source is its own token — `#doc_<commitment>`, never an `#ev_` name (R82 Entry 10, LOW).
    expect(lines[0]?.querySelector('[data-chip-kind="document"]')?.getAttribute('data-chip-source')).toBe(`#doc_${DOC_COMMITMENT}`);
    expect(container.textContent).not.toContain(DOC_COMMITMENT);
  });

  it('R6 a thesis citing ONLY documents still draws its chips — one line, no domain', () => {
    const container = renderWithIntl(
      <TabsProvider>
        <TickLine citations={[documentMention()]} locale="he" />
      </TabsProvider>,
      { locale: 'he' },
    ).container;
    expect(container.querySelectorAll('[data-tick-line] [data-chip-kind="document"]')).toHaveLength(1);
    expect(container.querySelector('.tick-line-domain')).toBeNull();
  });

  it('R7 no RECORD TAB for a document — its sheet is step 34’s, and a tab would be a pane nothing opens', () => {
    const tabs = recordTabs({ citations: parseThesisContext(overTheWire(thesisContextDocument)).head?.mentions ?? [], pages: [], locale: 'he' });
    expect(tabs.map((tab) => tab.id)).toEqual([expect.stringMatching(/^record:EVIDENCE:/) as unknown]);
  });
});

describe('THE WORKING VIEW, WHOLE — the chip in the centre, the strip, the owed entry and the transcript', () => {
  const OWED_DOCUMENT: ThesisOwedEntry = {
    kind: 'UNARGUED',
    thesisId: thesisContextDocument.thesis.thesisId,
    name: DOC_COMMITMENT,
    versionId: thesisContextDocument.head?.versionId ?? '',
    mentionId: 'mention-doc',
    command: `open_debate thesisId=${thesisContextDocument.thesis.thesisId} record={"document":"${DOC_COMMITMENT}"} rationale=…`,
    record: { commitment: DOC_COMMITMENT, title: DOC_TITLE },
    owedSince: '2026-09-25T08:00:00.000Z',
  };
  const withOwed: ThesisContext = { ...thesisContextDocument, owed: 1, reviews: [OWED_DOCUMENT] };

  it('R8 the page draws the chip in the text AND in the strip, names the owed document by TITLE, and shows no commitment as text', async () => {
    const page = await renderResearchThesis('he', { context: withOwed });
    const centre = page.querySelector('[data-region="centre"]');
    expect(centre?.querySelectorAll('[data-chip-kind="document"]')).toHaveLength(2);
    const owedName = page.querySelector('[data-record-name][data-record-kind="document"]');
    expect(owedName?.textContent).toBe(DOC_TITLE);
    // The command carries the commitment — it is the ONE place an id may be (board ד2·י's note) — so the scan reads
    // every TEXT NODE outside the command's code.
    const outsideCommands = [...page.querySelectorAll('*')]
      .filter((element) => element.closest('code, [data-command], pre') === null)
      .flatMap((element) => [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? ''));
    expect(outsideCommands.join(' ')).not.toContain(DOC_COMMITMENT);
  });

  it('R10 an UNTITLED owed document reads "—" and its commitment is text nowhere in the strip (§4 :167; board ד2·י)', async () => {
    const untitled: ThesisContext = { ...withOwed, reviews: [{ ...OWED_DOCUMENT, record: { commitment: DOC_COMMITMENT, title: null } }] };
    const page = await renderResearchThesis('he', { context: untitled });
    const owedName = page.querySelector('[data-record-name][data-record-kind="document"]');
    expect(owedName?.textContent).toBe('—');
    const outsideCommands = [...page.querySelectorAll('*')]
      .filter((element) => element.closest('code, [data-command], pre') === null)
      .flatMap((element) => [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent ?? ''));
    expect(outsideCommands.join(' ')).not.toContain(DOC_COMMITMENT);
  });

  it('R9 the VERSION turn counts the document among the UNARGUED — UNARGUED(v) includes #doc_ (§6 :700)', async () => {
    const page = await renderResearchThesis('he', { context: thesisContextDocument, withPane: true });
    const version = page.querySelector('[data-turn="VERSION"] [data-turn-composed]');
    expect(version?.textContent).toBe('+2 ציטוטים, 2 לא נטענו');
  });
});

// ---------------------------------------------------------------------------
// THE PUBLIC PAGE, ONCE A PUBLISHED VERSION CITES A DOCUMENT — document step 34 chunk 4a (R85 [R1] H2; Q7's production
// hold). The backend's public body carries thesis A4 :1476's V arm — `verified` REQUIRED — PLUS `document`, §7's block
// ("adds §7's public fields to this arm and reshapes nothing"). This frontend does not draw the block yet (document plan
// :280–:282): the page must PARSE the arm and draw the chip as a statement, and never throw on the new field.
// ---------------------------------------------------------------------------

describe('THE PUBLIC PAGE — a DOCUMENT citation carrying §7’s block (document step 34, R85 H2)', () => {
  const block = {
    kind: 'DOCUMENT',
    commitment: DOC_COMMITMENT,
    title: DOC_TITLE,
    custody: 'HELD',
    registry: { attestedBy: 'COMMITMENT', registryIndex: 3, blockTime: '2026-09-20T10:00:00.000Z', capture: null },
    verification: {
      mode: 'HELD',
      verified: true,
      at: '2026-09-26T10:00:00.000Z',
      says: 'the bytes the platform holds hash to the name, now; a third party timestamped a commitment to it',
      doesNotSay: ['that the bytes are authentic, complete, unaltered, or from whom'],
    },
    secondWitness: { code: 'NONE', words: 'none — the archive is absent, and the flag reads so' },
    opening: 'CONTENT',
    citedBy: [],
  };
  const arm = { ...documentMention({ verified: true }), document: block };

  afterEach(() => {
    setPublicBodies(undefined);
    setAuthState(undefined);
    setPathname(undefined);
  });

  it('F2 the arm PARSES with `document` beside it — the nine fields read, the block not narrowed and not refused', () => {
    const parsed = citation(overTheWire(arm), 'citation');
    expect(Object.keys(parsed).sort()).toEqual(['argued', 'custody', 'flag', 'kind', 'name', 'overObjection', 'pin', 'title', 'verified']);
  });

  it('F2 the PUBLIC thesis page renders it — the document chip drawn, the page not a 500, and none of the block’s words drawn yet', async () => {
    setAuthState('anonymous');
    setPathname(`/he/theses/${published.thesisId}`);
    const body = {
      ...published,
      version: { ...published.version, text: `${published.version.text}\n\nהחוזר קובע זאת #doc_${DOC_COMMITMENT}` },
      citations: [...published.citations, arm],
    };
    setPublicBodies({ [`/api/thesis/${published.thesisId}`]: { status: 200, body: overTheWire(body) } });
    const page = (await import('../src/app/[locale]/theses/[id]/page')).default;
    const rendered = await renderPage(page, { locale: 'he', id: published.thesisId }, { locale: 'he' });
    if (rendered.notFound) throw new Error('F2: the public page answered the one 404, not a body');
    expect(rendered.container.querySelector(`[data-chip="${DOC_COMMITMENT}"][data-chip-kind="document"]`)).not.toBeNull();
    expect(rendered.container.textContent).toContain(FIRST_FOUR);
    expect(rendered.container.textContent).not.toContain(block.verification.says);
  });
});
