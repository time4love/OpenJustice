jest.mock('../../src/lib/prisma', () => ({
  prisma: (require('../helpers/evidenceDouble') as typeof import('../helpers/evidenceDouble')).db,
}));
jest.mock('../../src/factories/LLMFactory', () => (require('../thesis/tools') as typeof import('../thesis/tools')).llmFactoryTripwire);

import { commitment as commitmentOf } from '../../src/lib/documentIdentity';
import * as evidencePredicates from '../../src/services/evidencePredicates';
import type { DocumentVerification } from '../../src/services/evidencePredicates';
import { evaluatePublication, publishabilityOf, rowsOf, type ThesisCheck } from '../../src/services/publicationEvaluation';
import { resetDouble, store } from '../helpers/evidenceDouble';
import { THESIS, VERSION } from '../thesis/fixtures';
import { PASSING, evidencePasses, seedPublishable } from '../thesis/gateWorld';
import { mentionRow } from '../thesis/rows';
import { resetTools } from '../thesis/tools';
import { HELD_NOW, SEALED, documentRow, versionRow } from './citationWorld';
import { CHECKS_THAT_NOW_BIND, CHECK_WITH_NO_SUBJECT, DOCUMENT_CHECK_IDS } from './contract';

// ---------------------------------------------------------------------------
// A6 :1521-:1541 — THE CHECKS A THESIS RUNS. STEP 34'S.
//
// EVIDENCE A6'S NON-BINDING ARM FALLS (A6 :1529). That design let a DOCUMENT mention pass
// EVIDENCE_VERIFIED, EVIDENCE_PINNED_CURRENT and EVIDENCE_DERIVED with `binding: false`
// because it could define none of them for the class; §4 and §3 now define each, so the
// three BIND exactly as on a capture's and NO CHECK HAS A NON-BINDING PASS.
//
// EVERY CHECK NAMES WHAT IT EXAMINED, AND AN EMPTY SCOPE SAYS SO — the vacuity rule this
// repository already applies to every scan, applied here to a new subject: a version with
// no `#doc_` token reports ZERO EXAMINED rather than passing silently (plan step 34 :270-:272).
//
// REWRITTEN AT DOCUMENT STEP 34 (R84 sketch S4, DECLARED). The step-27 file asked a `runDocumentChecks` on
// `services/decideOpening` for `{ id: number, passed, binding, examined: number }` over no world at all. The gate that
// landed at thesis step 23 is `rowsOf(evaluatePublication(…))`: rows keyed by id, verdict PASS · FAIL · EXAMINED_NONE,
// `kind: 'hard' | 'advisory'`, `examined` a LIST — and NO binding flag, by ruling (evidenceChecks.ts :73–:86; thesis A6
// :1605–:1608: "every check binds or is advisory by name"). Each case below states the SAME property over those rows, in
// a world that makes it true or false: `binding: true` is `kind: 'hard'` and a FAIL that refuses; `examined: 0` is
// `examined: []` with EXAMINED_NONE. The world is the thesis gate's (`test/thesis/gateWorld.ts`, read, never edited),
// its head citing one document; the document is named by the commitment its row REPRODUCES — `commitment(docId, salt)`,
// never `citationWorld`'s label, which RECOMPUTABLE(e) rightly refuses (R84 chunk 1).
// ---------------------------------------------------------------------------

const DOC_ID = `0x${'d1'.repeat(32)}`;
const C = commitmentOf(DOC_ID, Buffer.alloc(32));
const DEBATE = { id: 'debate-doc', status: 'PROMOTED', recordFileHash: C, thesisId: THESIS.id };
const TEXT = 'The voluntary consent of the human subject is absolutely essential.';
const PRESENT_SPAN = 'The voluntary consent of the human subject';
const ABSENT_SPAN = 'consent is optional where the state decides';
const TITLE_WITH_A_NAME = 'Letter from Yossi Cohen to the ministry';

const verified: DocumentVerification = { asked: true, byCommitment: new Map([[C, { verified: true }]]) };

/**
 * The gate world, its head citing the document ALONE in a paragraph that quotes `quotes`: HELD (or SEALED), promoted and
 * affirmed at CURRENT(d), argued on this thesis; `opening` decided, or none.
 */
async function seedDocumentHead(
  over: { quotes?: readonly string[]; opening?: 'PASSAGE' | 'CONTENT' | 'BYTES' | null; sealed?: boolean; text?: string | null; title?: string; cite?: boolean } = {},
): Promise<void> {
  await seedPublishable();
  if (over.cite === false) {
    // The gate world's own citation is a DIFF modelled for the gate's STUBBED evidence half (`test/thesis/gate.test.ts`
    // :107), not for VERIFIED's read of its captures — so a head citing no document is graded with that half stubbed, as
    // the thesis suite grades it. Rows 18 and 19 read nothing of it.
    jest.spyOn(evidencePredicates, 'publishableEvidence').mockResolvedValue(evidencePasses(VERSION));
    return;
  }
  const pin = over.sealed === true ? `0x${'a1'.repeat(32)}` : HELD_NOW;
  store.documents = [documentRow({ commitment: C, ...(over.sealed === true ? SEALED : {}), ...(over.title === undefined ? {} : { title: over.title }) })];
  store.documentContentVersions = [
    versionRow(pin, {
      commitment: C,
      text: over.text === undefined ? TEXT : over.text,
      ...(over.sealed === true ? { derivedFrom: 'AT_RECEIPT', derivedUnder: ['v0-receipt'] } : {}),
    }),
  ];
  store.evidenceRows = [
    { fileHash: C, kind: 'DOCUMENT', documentCommitment: C, status: 'PROMOTED', affirmedContentVersionHash: pin, snapshotId: null, snapshot: null, urlVersionDiffId: null, urlVersionDiff: null },
  ];
  store.mentions = [
    mentionRow({ id: 'mention-doc', versionId: VERSION.id, kind: 'DOCUMENT', name: C, contentVersionHash: pin, debateSessionId: DEBATE.id }, false, DEBATE),
  ];
  const quoted = (over.quotes ?? [PRESENT_SPAN]).map((q) => `"${q}"`).join(' ');
  store.versions = [{ ...VERSION, text: `The Code says ${quoted} #doc_${C}.` }];
  const opening = over.opening === undefined ? 'CONTENT' : over.opening;
  store.documentOpeningDecisions =
    opening === null
      ? []
      : [{ id: 'opening-1', thesisId: THESIS.id, commitment: C, sequence: 1, opening, researcherId: 'researcher-author', createdAt: new Date(Date.UTC(2026, 8, 22)) }];
}

const rows = async (verification: DocumentVerification = verified, assessment = PASSING): Promise<ThesisCheck[]> =>
  rowsOf(await evaluatePublication(VERSION.id, assessment, verification));

const rowOf = (all: readonly ThesisCheck[], id: string): ThesisCheck => {
  // Compared as a STRING: a gate with no such row fails THIS case by name, never the file at compile time.
  const found = all.find((r) => String(r.id) === id);
  if (found === undefined) throw new Error(`the gate rendered no ${id} row`);
  return found;
};

beforeEach(() => {
  resetDouble();
  resetTools();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('A6 :1535-:1536 — the two added checks, BY ID', () => {
  it('18 is DOCUMENT_OPENING_DECIDED and 19 is DOCUMENT_QUOTES_PRESENT (thesis A6 :1602)', async () => {
    expect(DOCUMENT_CHECK_IDS.DOCUMENT_OPENING_DECIDED).toBe(18);
    expect(DOCUMENT_CHECK_IDS.DOCUMENT_QUOTES_PRESENT).toBe(19);
    // AND IN THAT ORDER, AFTER A6's FIRST SEVENTEEN — the rows' positions are the ids.
    await seedDocumentHead();
    const all = await rows();
    expect([all.at(17)?.id, all.at(18)?.id, all.length]).toEqual(['DOCUMENT_OPENING_DECIDED', 'DOCUMENT_QUOTES_PRESENT', 19]);
  });

  it('18 fails a head whose #doc_ mention has NO opening decided, and names the mention', async () => {
    await seedDocumentHead({ opening: null });
    const check = rowOf(await rows(), 'DOCUMENT_OPENING_DECIDED');
    expect([check.kind, check.verdict]).toEqual(['hard', 'FAIL']);
    expect(check.failures).toEqual([expect.objectContaining({ name: C, opening: null })]);
  });

  it('18 fails BYTES on a SEALED document — §7 :803-:804 names that arm explicitly', async () => {
    await seedDocumentHead({ sealed: true, opening: 'BYTES' });
    const e = await evaluatePublication(VERSION.id, PASSING, verified);
    const check = rowOf(rowsOf(e), 'DOCUMENT_OPENING_DECIDED');
    expect([check.kind, check.verdict]).toEqual(['hard', 'FAIL']);
    expect(check.failures).toEqual([expect.objectContaining({ name: C, opening: 'BYTES' })]);
    expect(publishabilityOf(e).failed).toContain('DOCUMENT_OPENING_DECIDED');
  });

  it('19 refuses an ABSENT quoted span and NAMES IT — the researcher quoted a phrase the document lacks', async () => {
    await seedDocumentHead({ quotes: [PRESENT_SPAN, ABSENT_SPAN] });
    const e = await evaluatePublication(VERSION.id, PASSING, verified);
    const check = rowOf(rowsOf(e), 'DOCUMENT_QUOTES_PRESENT');
    expect([check.kind, check.verdict]).toEqual(['hard', 'FAIL']);
    expect(check.failures).toEqual([expect.objectContaining({ name: C, span: ABSENT_SPAN })]);
    expect(publishabilityOf(e).failed).toContain('DOCUMENT_QUOTES_PRESENT');
  });

  it('19 PASSES on PRESENT or UNCHECKED — a bytes-only document does not fail for being unreadable (A6 :1536)', async () => {
    await seedDocumentHead({ quotes: [PRESENT_SPAN] });
    const present = rowOf(await rows(), 'DOCUMENT_QUOTES_PRESENT');
    expect([present.kind, present.verdict]).toEqual(['hard', 'PASS']);
    expect(present.examined).toEqual([{ name: C, spans: [{ span: PRESENT_SPAN, verdict: 'PRESENT' }] }]);

    resetDouble();
    await seedDocumentHead({ quotes: [ABSENT_SPAN], text: null });
    const unchecked = rowOf(await rows(), 'DOCUMENT_QUOTES_PRESENT');
    expect([unchecked.kind, unchecked.verdict]).toEqual(['hard', 'PASS']);
    // LOW-j (A3 :1386): UNCHECKED, WITH THE REASON — the content is the bytes, so there is no text to search.
    expect(unchecked.examined).toEqual([
      { name: C, spans: [{ span: ABSENT_SPAN, verdict: 'UNCHECKED', reason: expect.stringContaining('bytes') }] },
    ]);
  });
});

describe('THE VACUITY RULE — zero examined is REPORTED, never a silent pass', () => {
  it('a version with NO #doc_ token reports ZERO EXAMINED on 18 and 19 (plan :270-:272)', async () => {
    await seedDocumentHead({ cite: false });
    const all = await rows();
    for (const id of ['DOCUMENT_OPENING_DECIDED', 'DOCUMENT_QUOTES_PRESENT']) {
      const check = rowOf(all, id);
      // A pass that examined nothing says ZERO, never nothing — thesis A7 :1655-:1657.
      expect([check.verdict, check.examined, check.failures]).toEqual(['EXAMINED_NONE', [], []]);
    }
  });

  it('every check reports what it examined — a check with no `examined` cannot be audited', async () => {
    await seedDocumentHead();
    const all = await rows();
    // THE FLOOR: the gate ran all nineteen checks.
    expect(all).toHaveLength(19);
    for (const check of all) expect(Array.isArray(check.examined)).toBe(true);
  });
});

describe('A6 :1529-:1531 — the THREE that now BIND, and the ONE with no subject', () => {
  it('EVIDENCE_VERIFIED, EVIDENCE_PINNED_CURRENT and EVIDENCE_DERIVED bind on a DOCUMENT mention', async () => {
    await seedDocumentHead();
    const all = await rows();
    // THE FLOOR: three names, so an empty list cannot pass this.
    expect(CHECKS_THAT_NOW_BIND).toHaveLength(3);
    for (const name of CHECKS_THAT_NOW_BIND) {
      const check = rowOf(all, name);
      // BINDING is `hard` AND the document EXAMINED — a hard row that never looked at it would bind nothing.
      expect([check.kind, check.verdict]).toEqual(['hard', 'PASS']);
      expect(check.examined).toEqual([expect.objectContaining({ mentionId: 'mention-doc', fileHash: C })]);
    }
  });

  it('a document failing VERIFIED REFUSES — the arm that used to pass non-binding (plan :274)', async () => {
    await seedDocumentHead();
    const e = await evaluatePublication(VERSION.id, PASSING, { asked: true, byCommitment: new Map([[C, { verified: false }]]) });
    const check = rowOf(rowsOf(e), 'EVIDENCE_VERIFIED');
    expect(check.verdict).toBe('FAIL');
    expect(check.failures).toEqual([expect.objectContaining({ fileHash: C })]);
    expect(publishabilityOf(e).publishable).toBe(false);
  });

  it('check 17 reports it examined NONE — a check with no subject, NEVER a check that passed (A6 :1533)', async () => {
    await seedDocumentHead();
    const seventeen = rowOf(await rows(), CHECK_WITH_NO_SUBJECT);
    expect([seventeen.kind, seventeen.verdict]).toEqual(['hard', 'EXAMINED_NONE']);
  });

  it('CITES_EVIDENCE is satisfied by a DOCUMENT mention alone (A6 :1534)', async () => {
    await seedDocumentHead();
    const check = rowOf(await rows(), 'CITES_EVIDENCE');
    expect([check.verdict, check.examined]).toEqual(['PASS', [{ name: C }]]);
  });
});

describe('A6 :1537 (RULED 2026-09-22) — NAMES_NO_PERSON examines every cited document’s TITLE', () => {
  // RULED, R84 Q15 (thesis flows :757 as CONFORMED 2026-09-26): the publication ASSESSOR is handed every cited document's
  // title with its material and lists the names in it; the row names each title it examined. The assessor's answer is
  // this gate's INPUT (`PublicationAssessment`) — here, as it lists the title's name.
  it('a title naming a person FAILS the check, and the check names the title it examined', async () => {
    await seedDocumentHead({ title: TITLE_WITH_A_NAME });
    const check = rowOf(await rows(verified, { ...PASSING, names: ['Yossi Cohen'] }), 'NAMES_NO_PERSON');
    expect(check.examined).toEqual(expect.arrayContaining([expect.objectContaining({ title: TITLE_WITH_A_NAME })]));
    expect(check.verdict).toBe('FAIL');
  });

  it('a document’s CONTENT may name persons; the version and the TITLE may not (A6 :1537)', async () => {
    await seedDocumentHead({ text: 'Signed by Yossi Cohen, director.', quotes: ['director'] });
    const check = rowOf(await rows(), 'NAMES_NO_PERSON');
    expect(check.examined).toEqual(expect.arrayContaining([expect.objectContaining({ title: expect.any(String) })]));
    expect(check.verdict).toBe('PASS');
  });
});
