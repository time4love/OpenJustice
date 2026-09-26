jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);

import { db, resetDouble, store, written, type Row } from './helpers/evidenceDouble';
import {
  COMMITMENT,
  HELD_BEFORE,
  HELD_NOW,
  OTHER_COMMITMENT,
  RECEIPT,
  documentRow,
  seedHeld,
  seedPromoted,
  seedSealed,
  versionRow,
} from './document/citationWorld';
import { AUTHOR } from './thesis/fixtures';
import { ON_THE_FIXTURE, answerOf, call, resetTools, seedThesis, textCiting } from './thesis/tools';

// ---------------------------------------------------------------------------
// THE `#doc_` CITATION AT THE VERSION WRITE — docs/gf-document-refactor-plan.md step 33 :243–:246 (as conformed at :245),
// docs/gf-document-flows.md §6 :695–:700, A4 :1452–:1453, A3 :1368–:1371.
//
// "By addition at thesis step 20's parser: `#doc_<COMMITMENT>` becomes a mention of kind DOCUMENT with name = commitment,
// the pin from `affirmed` where an Evidence row exists and otherwise CURRENT(d)'s hash — the receipt version for a sealed
// document; T2's refusals NOT_A_RECORD, AWAITING_DERIVATION and SHED, one spelling each."
//
// IN THE GATING `unit` PROJECT, over the evidence double's document tables (additive, R81 Q1): the `document` project
// gates nothing until step 36 (plan :121), and a write path a merge may break must be held where a merge is checked.
// The thesis suite's own cases stay UNEDITED — its world holds no document, so a `#doc_` there names none.
// ---------------------------------------------------------------------------

const next = ON_THE_FIXTURE.add_thesis_version;

const AFFIRMED = `0x${'e1'.repeat(32)}`;

beforeEach(() => {
  resetDouble();
  resetTools();
});

const mentionsIn = (out: Record<string, unknown>): Record<string, unknown>[] => {
  const list = out['mentions'];
  if (!Array.isArray(list)) throw new Error(`no mentions list in ${JSON.stringify(out)}`);
  return list as Record<string, unknown>[];
};

/**
 * A refusal, and NOTHING written — `test/thesis/tools.ts`' `expectRefusal` in this file's terms. That helper's type is the
 * thesis contract's code union, which is a KEEP file and does not name SHED (document A4 :1453's addition); this file
 * asserts the same two things without editing it.
 */
function expectRefused(out: string, code: string): string {
  const body = JSON.parse(out) as { error?: unknown; code?: unknown };
  expect([body.code, typeof body.error === 'string' && /\S/.test(body.error)]).toEqual([code, true]);
  expect(written.filter((w) => w.model === 'thesisVersion' || w.model === 'thesisMention')).toEqual([]);
  return String(body.error);
}

const writtenMentions = (): Row[] => written.filter((w) => w.model === 'thesisMention').map((w) => w.data);

describe('add_thesis_version — a #doc_ token is a mention of kind DOCUMENT (plan :243; A4 :1452)', () => {
  it('writes ONE mention of kind DOCUMENT whose name is the commitment, and pins CURRENT(d) where no Evidence row exists (§6 :697)', async () => {
    seedThesis();
    seedHeld();
    const out = answerOf(await call('add_thesis_version', { ...next, text: textCiting(`#doc_${COMMITMENT}`) }, AUTHOR));
    expect(mentionsIn(out)).toEqual([{ kind: 'DOCUMENT', name: COMMITMENT, pin: HELD_NOW, argued: false }]);
    const rows = writtenMentions();
    expect(rows).toEqual([expect.objectContaining({ kind: 'DOCUMENT', name: COMMITMENT, contentVersionHash: HELD_NOW, debateSessionId: null })]);
  });

  it('pins `affirmed` where an Evidence row exists, even though CURRENT(d) moved — the ONLY value allowed (§6 :696)', async () => {
    seedThesis();
    seedHeld();
    seedPromoted(AFFIRMED);
    const out = answerOf(await call('add_thesis_version', { ...next, text: textCiting(`#doc_${COMMITMENT}`) }, AUTHOR));
    expect(mentionsIn(out)).toEqual([{ kind: 'DOCUMENT', name: COMMITMENT, pin: AFFIRMED, argued: false }]);
  });

  it('pins the AT_RECEIPT version of a SEALED document, forever (A3 :1370; plan :245)', async () => {
    seedThesis();
    seedSealed();
    const out = answerOf(await call('add_thesis_version', { ...next, text: textCiting(`#doc_${COMMITMENT}`) }, AUTHOR));
    expect(mentionsIn(out)).toEqual([{ kind: 'DOCUMENT', name: COMMITMENT, pin: RECEIPT, argued: false }]);
  });

  it('an unargued #doc_ mention is on T3’s work-list — `unargued` names it (§6 :700)', async () => {
    seedThesis();
    seedHeld();
    const out = answerOf(await call('add_thesis_version', { ...next, text: textCiting(`#doc_${COMMITMENT}`) }, AUTHOR));
    expect(out['unargued']).toEqual([COMMITMENT]);
  });

  it('a document cited twice is ONE mention — deduplicated per (kind, name), as every citation is', async () => {
    seedThesis();
    seedHeld();
    const out = answerOf(
      await call('add_thesis_version', { ...next, text: textCiting(`#doc_${COMMITMENT}`, `#doc_${COMMITMENT}`) }, AUTHOR),
    );
    expect(mentionsIn(out).map((m) => [m['kind'], m['name']])).toEqual([['DOCUMENT', COMMITMENT]]);
  });
});

describe('add_thesis_version — the three refusals of a #doc_ token, one spelling each (A4 :1453; plan :245)', () => {
  it('NOT_A_RECORD for a commitment that names no document — T2’s one word for a token naming nothing (R81 Q1)', async () => {
    seedThesis();
    seedHeld();
    const out = await call('add_thesis_version', { ...next, text: textCiting(`#doc_${OTHER_COMMITMENT}`) }, AUTHOR);
    expectRefused(out, 'NOT_A_RECORD');
    expect(String((JSON.parse(out) as { error: string }).error)).toContain(`#doc_${OTHER_COMMITMENT}`);
  });

  it('NOT_A_RECORD for a MALFORMED #doc_ — uppercase hex is never normalised (A1 :1244)', async () => {
    seedThesis();
    seedHeld();
    const out = await call('add_thesis_version', { ...next, text: textCiting(`#doc_0x${'C1'.repeat(32)}`) }, AUTHOR);
    expectRefused(out, 'NOT_A_RECORD');
  });

  it('SHED for a document whose content was taken back — naming the cause and the date, never AWAITING (A3 :1371)', async () => {
    seedThesis();
    store.documents = [documentRow({ bytes: null })];
    store.sheds = [{ commitment: COMMITMENT, cause: 'OPERATOR', researcherId: AUTHOR, reason: 'בקשת בית משפט', at: new Date(Date.UTC(2026, 8, 21)) }];
    const out = await call('add_thesis_version', { ...next, text: textCiting(`#doc_${COMMITMENT}`) }, AUTHOR);
    expectRefused(out, 'SHED');
    const error = String((JSON.parse(out) as { error: string }).error);
    expect([error.includes('OPERATOR'), error.includes('2026-09-21')]).toEqual([true, true]);
  });

  it('AWAITING_DERIVATION for a HELD document with no version under the current extractor — naming it', async () => {
    seedThesis();
    store.documents = [documentRow()];
    store.documentContentVersions = [versionRow(HELD_BEFORE, { extractorVersion: 'v0-an-older-extractor' })];
    const out = await call('add_thesis_version', { ...next, text: textCiting(`#doc_${COMMITMENT}`) }, AUTHOR);
    expectRefused(out, 'AWAITING_DERIVATION');
    expect(String((JSON.parse(out) as { error: string }).error)).toContain(`#doc_${COMMITMENT}`);
  });

  it('ONE read for every cited document, before the transaction — never one per token', async () => {
    seedThesis();
    seedHeld();
    store.documents = [...store.documents, documentRow({ commitment: OTHER_COMMITMENT, docId: `0x${'d2'.repeat(32)}` })];
    store.documentContentVersions = [...store.documentContentVersions, versionRow(HELD_NOW, { id: 'dcv-other', commitment: OTHER_COMMITMENT })];
    db.document.findMany.mockClear();
    answerOf(await call('add_thesis_version', { ...next, text: textCiting(`#doc_${COMMITMENT}`, `#doc_${OTHER_COMMITMENT}`) }, AUTHOR));
    expect(db.document.findMany).toHaveBeenCalledTimes(1);
  });
});
