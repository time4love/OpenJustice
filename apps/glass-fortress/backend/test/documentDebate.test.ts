const assess = jest.fn();
jest.mock('../src/services/promotionAssessor', () => ({
  // The rest of the module is REAL — its types, its agent name and `PROMOTION_ASSESSOR_MODEL`, which the writer records.
  ...jest.requireActual<object>('../src/services/promotionAssessor'),
  PromotionAssessor: class {
    assess = assess;
  },
}));

const mockResearcherId = jest.fn<string | null, []>();
jest.mock('../src/context/researcherContext', () => ({ getResearcherId: mockResearcherId }));

const mockReadObject = jest.fn<Promise<Uint8Array | null>, [string]>();
jest.mock('../src/services/documentBucket', () => ({
  ...jest.requireActual<object>('../src/services/documentBucket'),
  readObject: mockReadObject,
}));

// THE BOUND IS CALLED, NEVER RE-SPELLED (R82 H1): the describer's bound is moved to a small value for THIS file, so a
// module that typed `50_000_000` instead of importing `DESCRIBE_TOO_LARGE_BYTES` would read a file this file calls too
// large. Every case below imports the bound from the same mocked module, so each world is sized against it.
jest.mock('../src/lib/acceptedDocumentTypes', () => ({
  ...jest.requireActual<object>('../src/lib/acceptedDocumentTypes'),
  DESCRIBE_TOO_LARGE_BYTES: 4096,
}));

jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));

import { z } from 'zod';
import { DESCRIBE_TOO_LARGE_BYTES } from '../src/lib/acceptedDocumentTypes';
import { modelFileOf } from '../src/lib/documentModelPart';
import { openDebateHandler, openDebateSchema, state } from '../src/mcp/tools/openDebate';
import { respondInDebateHandler } from '../src/mcp/tools/respondInDebate';
import { FORENSIC_PROMOTION_ASSESSMENT_PROMPT_VERSION } from '../src/prompts/forensicPromotionAssessment';
import { loadDebate, namedRecordOf } from '../src/services/debateState';
import { promotionBlockers } from '../src/services/promoteFromDebate';
import { PROMOTION_ASSESSOR_MODEL } from '../src/services/promotionAssessor';
import { debateTurns, type Voices } from '../src/services/thesisTranscript';
import { COMMITMENT, HELD_BEFORE, HELD_NOW, OTHER_COMMITMENT, RECEIPT, SEALED, TITLE, documentRow, versionRow } from './document/citationWorld';
import { AUTHOR, CURRENT_TEXT, SESSION, THESIS, documentSession, seedDocumentDebate } from './document/debateWorld';
import { NEVER_RAISED_FOR_A_DOCUMENT } from './document/contract';
import { db, resetDouble, store, written, type Row } from './helpers/evidenceDouble';

// ---------------------------------------------------------------------------
// THE DEBATE'S THIRD RECORD — document plan step 33 :247–:250; document flows §6 :701–:710, A2 :1339–:1341, A4
// :1454–:1457; evidence A4 :1117–:1146 as ruled 2026-09-25 (R81 QA, QB); thesis A4 :1476 (QA as conformed, QB).
//
// IN THE GATING `unit` PROJECT, over the evidence double's document tables (additive, R81 Q1): the `document` project
// gates nothing until step 36 (plan :121), and a path a merge may break is held where a merge is checked.
//
// THE ASSESSOR IS MOCKED AT ITS BOUNDARY — the class — and the bucket's read too: no case spends a model call or reads
// storage. `thesisMention.findFirst` answers by its `where` here (the double's answers whatever it is asked), so a
// document arm that asked for the wrong KIND of mention is seen.
// ---------------------------------------------------------------------------

const OPINION_SENTINEL = 'OPINION-SENTINEL-a-model-read-the-letterhead';

const ANSWER = {
  hasSubstance: true,
  substanceGaps: [],
  verdict: 'SUPPORTS',
  objection: '',
  assessment: 'הטיעון מעוגן בטקסט המחושב של החוזר.',
  assertions: [
    { researcherClaim: 'החוזר מורה לשמור את ערוץ הדיווח פתוח', whatEvidenceShows: 'ערוץ הדיווח פתוח' },
    { researcherClaim: 'החוזר אוסר על דיווח', whatEvidenceShows: 'הערוץ ייסגר מיד' },
  ],
};

/** `debateWorld`'s document debate, with this file's doubles answering: the assessor, the caller, the bucket. */
function world(): void {
  resetDouble();
  jest.clearAllMocks();
  mockResearcherId.mockReturnValue(AUTHOR);
  assess.mockResolvedValue(ANSWER);
  mockReadObject.mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  seedDocumentDebate();
}

beforeEach(world);

const open = (record: unknown = { document: COMMITMENT }, rationale = 'החוזר מורה לשמור את ערוץ הדיווח פתוח.') =>
  openDebateHandler({ thesisId: THESIS, record: record as never, rationale });

const parse = (json: string): Row => JSON.parse(json) as Row;
const handed = (): Row => {
  const input = assess.mock.calls.at(0)?.at(0) as Row | undefined;
  if (input === undefined) throw new Error('the assessor was not called');
  return input;
};
const sessionCreated = (): Row | undefined => written.find((w) => w.model === 'debateSession')?.data;
const storedAssessment = (): Row => {
  const event = written.find((w) => w.model === 'debateEvent' && w.data['type'] === 'ASSESSMENT_RETURNED');
  if (event === undefined) throw new Error('no ASSESSMENT_RETURNED was written');
  return JSON.parse(String(event.data['content'])) as Row;
};

// ---------------------------------------------------------------------------

describe('the INPUT is { document: commitment }; the ANSWER’s { commitment, title } is never an input (R81 QB; A4 :1455)', () => {
  const schema = z.object(openDebateSchema);
  const base = { thesisId: THESIS, rationale: 'r' };

  it('{ document } is taken; { commitment }, { commitment, title } and a document beside a url are REFUSED by the schema', () => {
    expect(schema.safeParse({ ...base, record: { document: COMMITMENT } }).success).toBe(true);
    const refused = [{ commitment: COMMITMENT }, { commitment: COMMITMENT, title: TITLE }, { document: COMMITMENT, url: 'https://x.il/' }];
    expect(refused.map((record) => schema.safeParse({ ...base, record }).success)).toEqual([false, false, false]);
  });
});

describe('open_debate over a document — its FIVE refusals, in order (§6 :701–:704; A4 :1455–:1457)', () => {
  const refusedWith = async (record: unknown = { document: COMMITMENT }): Promise<Row> => {
    const out = parse(await open(record));
    // A refusal writes nothing and spends nothing.
    expect(written).toEqual([]);
    expect(assess).not.toHaveBeenCalled();
    return out;
  };

  it('NOT_A_DOCUMENT — a commitment naming no document (A4 :1398, the word of the tools HANDED one)', async () => {
    const out = await refusedWith({ document: OTHER_COMMITMENT });
    expect(out['code']).toBe('NOT_A_DOCUMENT');
    expect(String(out['error'])).toContain(OTHER_COMMITMENT);
  });

  it('NOT_CITED naming #doc_ — and an EVIDENCE mention of the same name is not a citation of the document', async () => {
    store.mentions = [{ ...store.mentions[0], kind: 'EVIDENCE' }];
    const out = await refusedWith();
    expect(out['code']).toBe('NOT_CITED');
    expect(String(out['error'])).toContain(`#doc_${COMMITMENT}`);
    expect(String(out['error'])).not.toContain('#ev_');
  });

  it('SHED — naming its cause and date (A4 :1400)', async () => {
    store.documents = [documentRow({ bytes: null })];
    store.sheds = [{ commitment: COMMITMENT, cause: 'SENDER', researcherId: null, reason: null, at: new Date(Date.UTC(2026, 8, 21)) }];
    const out = await refusedWith();
    expect(out['code']).toBe('SHED');
    expect(String(out['error'])).toMatch(/SENDER, 2026-09-21/);
  });

  it('AWAITING_DERIVATION — HELD, and no version under the current extractor', async () => {
    store.documentContentVersions = [versionRow(HELD_BEFORE, { derivedUnder: ['v0-an-older-extractor'] })];
    expect((await refusedWith())['code']).toBe('AWAITING_DERIVATION');
  });

  it('NOTHING_TO_PROMOTE — SEALED, and CURRENT(d).text is null; a SEALED document WITH text opens', async () => {
    store.documents = [documentRow(SEALED)];
    store.documentContentVersions = [versionRow(RECEIPT, { derivedFrom: 'AT_RECEIPT', derivedUnder: ['v0-the-receipt-extractor'], text: null })];
    expect((await refusedWith())['code']).toBe('NOTHING_TO_PROMOTE');

    world();
    store.documents = [documentRow(SEALED)];
    store.documentContentVersions = [versionRow(RECEIPT, { derivedFrom: 'AT_RECEIPT', derivedUnder: ['v0-the-receipt-extractor'] })];
    store.mentions = [{ ...store.mentions[0], contentVersionHash: RECEIPT }];
    expect(parse(await open())['code']).toBeUndefined();
  });

  it('THE ORDER: an unknown commitment is NOT_A_DOCUMENT though uncited; an uncited SHED document is NOT_CITED', async () => {
    store.mentions = [];
    expect((await refusedWith({ document: OTHER_COMMITMENT }))['code']).toBe('NOT_A_DOCUMENT');
    store.sheds = [{ commitment: COMMITMENT, cause: 'SENDER', researcherId: null, reason: null, at: new Date(Date.UTC(2026, 8, 21)) }];
    store.documents = [documentRow({ bytes: null })];
    expect((await refusedWith())['code']).toBe('NOT_CITED');
  });

  it('NOT_ACQUIRED, CONTRADICTED, NARROWED are NEVER raised for a document — every custody × content world, asserted', async () => {
    // THE FLOOR: the list is three, so an empty list cannot pass vacuously.
    expect(NEVER_RAISED_FOR_A_DOCUMENT).toHaveLength(3);
    const worlds: (() => void)[] = [
      () => undefined,
      () => { store.documents = [documentRow({ mimeType: 'image/png' })]; store.documentContentVersions = [versionRow(HELD_NOW, { text: null })]; },
      () => { store.documents = [documentRow(SEALED)]; store.documentContentVersions = [versionRow(RECEIPT, { derivedFrom: 'AT_RECEIPT', derivedUnder: ['v0'] })]; },
      () => { store.documents = [documentRow(SEALED)]; store.documentContentVersions = [versionRow(RECEIPT, { derivedFrom: 'AT_RECEIPT', derivedUnder: ['v0'], text: null })]; },
      () => { store.documents = [documentRow({ bytes: null })]; store.sheds = [{ commitment: COMMITMENT, cause: 'SENDER', researcherId: null, reason: null, at: new Date() }]; },
      () => { store.documentContentVersions = [versionRow(HELD_BEFORE, { derivedUnder: ['v0'] })]; },
      () => { store.documents = []; },
      () => { store.mentions = []; },
    ];
    const codes: unknown[] = [];
    for (const arrange of worlds) {
      world();
      arrange();
      codes.push(parse(await open())['code']);
      // The capture and pair checks are never reached for a document: no page is looked up.
      expect(db.trackedUrl.findUnique).not.toHaveBeenCalled();
    }
    expect(codes.filter((code) => (NEVER_RAISED_FOR_A_DOCUMENT as readonly unknown[]).includes(code))).toEqual([]);
    // And the worlds are the ones named: four open, four refuse, each by its own word.
    expect(codes).toEqual([undefined, undefined, undefined, 'NOTHING_TO_PROMOTE', 'SHED', 'AWAITING_DERIVATION', 'NOT_A_DOCUMENT', 'NOT_CITED']);
  });
});

describe('the session — recordCommitment, and recordFileHash IS the commitment (A2 :1339–:1341)', () => {
  it('writes the third key alone, and names the record by its commitment — never the DOC_ID', async () => {
    await open();
    const created = sessionCreated();
    expect(created).toMatchObject({
      thesisId: THESIS,
      recordFileHash: COMMITMENT,
      recordCommitment: COMMITMENT,
      recordSnapshotId: null,
      recordDiffId: null,
      openKey: `${THESIS}:${COMMITMENT}`,
      status: 'OPEN',
    });
    expect(JSON.stringify(created)).not.toContain(String(documentRow()['docId']));
  });
});

describe('what the assessor is handed — the rationale, the passages, CURRENT(d)’s text or bytes, NEVER the opinion (§6 :705–:708)', () => {
  it('TEXT: CURRENT(d)’s text, the title, no page — and every paragraph carrying #doc_<commitment>, byte for byte, and no other', async () => {
    await open();
    expect(handed()).toEqual({
      url: null,
      content: { kind: 'DOCUMENT', title: TITLE, reading: { form: 'TEXT', text: CURRENT_TEXT } },
      passages: [
        `החוזר מורה לשמור את ערוץ הדיווח פתוח #doc_${COMMITMENT}`,
        `ובפסקה נוספת: החוזר מורה על דיווח שבועי #doc_${COMMITMENT}`,
      ],
      rationale: 'החוזר מורה לשמור את ערוץ הדיווח פתוח.',
      priorTurns: [],
    });
    expect(mockReadObject).not.toHaveBeenCalled();
  });

  it('NEVER THE OPINION — a reading held beside every version and on the row reaches no part of the assessor’s input', async () => {
    store.documents = [documentRow({ opinion: { summary: OPINION_SENTINEL } })];
    store.documentContentVersions = store.documentContentVersions.map((v) => ({
      ...v,
      opinions: [{ model: 'm', promptVersion: 'p', body: { summary: OPINION_SENTINEL } }],
    }));
    await open();
    expect(JSON.stringify(handed())).not.toContain(OPINION_SENTINEL);
  });

  it('FILE: a HELD image with no computed text is handed AS ITS FILE — the bucket’s bytes, encoded by the one builder', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);
    mockReadObject.mockResolvedValue(bytes);
    store.documents = [documentRow({ mimeType: 'image/png' })];
    store.documentContentVersions = [versionRow(HELD_NOW, { text: null })];
    await open();
    expect(handed()['content']).toEqual({ kind: 'DOCUMENT', title: TITLE, reading: { form: 'FILE', file: modelFileOf('image/png', bytes) } });
    expect(mockReadObject).toHaveBeenCalledWith(documentRow()['bytes']);
  });

  // BOTH FAMILIES THE BOUND COVERS (R82 Entry 3, MEDIUM 1): A4 :1440 bounds every file the describer reads — an image
  // or a PDF — and `describeDocument.ts` applies it to every FILE reading; a bound held for PDFs alone would hand an
  // oversized image to the provider unseen.
  it.each(['application/pdf', 'image/png'])(
    'H1 — a HELD %s with no text above DESCRIBE_TOO_LARGE_BYTES is bytes no model reads: the title alone, no refusal, no read',
    async (mimeType) => {
      // The bound as this file mocks it — CALLED by the module, or this case reads a file it should not.
      expect(DESCRIBE_TOO_LARGE_BYTES).toBe(4096);
      store.documentContentVersions = [versionRow(HELD_NOW, { text: null })];
      store.documents = [documentRow({ mimeType, byteLength: DESCRIBE_TOO_LARGE_BYTES + 1 })];
      const out = parse(await open());
      expect(out['code']).toBeUndefined();
      expect(handed()['content']).toEqual({ kind: 'DOCUMENT', title: TITLE, reading: { form: 'UNREAD' } });
      expect(mockReadObject).not.toHaveBeenCalled();

      // AND AT THE BOUND ITSELF the file is read — the bound is inclusive, as `describe_document`'s TOO_LARGE is.
      world();
      store.documentContentVersions = [versionRow(HELD_NOW, { text: null })];
      store.documents = [documentRow({ mimeType, byteLength: DESCRIBE_TOO_LARGE_BYTES })];
      await open();
      expect((handed()['content'] as { reading: { form: string } }).reading.form).toBe('FILE');
    },
  );

  it('bytes no model reads — audio, and a spreadsheet with no computed text — are the title alone, with no refusal (§6 :739)', async () => {
    for (const mimeType of ['audio/mpeg', 'text/csv']) {
      world();
      store.documents = [documentRow({ mimeType })];
      store.documentContentVersions = [versionRow(HELD_NOW, { text: null })];
      expect(parse(await open())['code']).toBeUndefined();
      expect(handed()['content']).toEqual({ kind: 'DOCUMENT', title: TITLE, reading: { form: 'UNREAD' } });
    }
    expect(mockReadObject).not.toHaveBeenCalled();
  });
});

describe('the ASSESSMENT stored — its assertions audited, and which model and prompt judged it (R81 QA; A2 :1317 paid)', () => {
  it('each assertion with quoteVerified, phraseVerified and its reason; the model and the prompt version beside them', async () => {
    await open();
    const stored = storedAssessment();
    expect(stored['assertions']).toEqual([
      {
        researcherClaim: 'החוזר מורה לשמור את ערוץ הדיווח פתוח',
        quoteVerified: true,
        whatEvidenceShows: 'ערוץ הדיווח פתוח',
        phraseVerified: 'PRESENT',
        phraseVerifiedReason: null,
      },
      {
        researcherClaim: 'החוזר אוסר על דיווח',
        quoteVerified: false,
        whatEvidenceShows: 'הערוץ ייסגר מיד',
        phraseVerified: 'ABSENT',
        phraseVerifiedReason: null,
      },
    ]);
    expect([stored['model'], stored['promptVersion']]).toEqual([PROMOTION_ASSESSOR_MODEL(), FORENSIC_PROMOTION_ASSESSMENT_PROMPT_VERSION]);
  });

  it('over a FILE every assertion is UNCHECKED with the reason — the model read an image; the platform checks no image', async () => {
    store.documents = [documentRow({ mimeType: 'image/png' })];
    store.documentContentVersions = [versionRow(HELD_NOW, { text: null })];
    await open();
    const assertions = storedAssessment()['assertions'] as Row[];
    expect(assertions.map((a) => a['phraseVerified'])).toEqual(['UNCHECKED', 'UNCHECKED']);
    for (const a of assertions) expect(a['phraseVerifiedReason']).toMatch(/bytes/);
  });

  it('NOTHING GATES ON AN ASSERTION: every phrase ABSENT and every quote false leaves the debate promotable as SUBSTANCE says', async () => {
    assess.mockResolvedValue({ ...ANSWER, assertions: [{ researcherClaim: 'לא נאמר', whatEvidenceShows: 'לא כתוב' }] });
    // A REVISION on a session an earlier round already cleared (the double reads the session as seeded, not as updated).
    store.openByKey = { id: SESSION };
    store.session = documentSession({ hasSubstance: true, verdict: 'SUPPORTS' });
    const out = parse(await open());
    expect((storedAssessment()['assertions'] as Row[]).map((a) => [a['quoteVerified'], a['phraseVerified']])).toEqual([[false, 'ABSENT']]);
    // The columns move as SUBSTANCE and MERIT say, and no blocker names an assertion.
    expect(written.find((w) => w.model === 'debateSession' && w.op === 'update')?.data).toEqual({ hasSubstance: true, verdict: 'SUPPORTS' });
    expect(out['blockedBy']).toEqual([]);
  });
});

describe('the ANSWER — the record as { commitment, title }, the thread as the page shows it (QB; thesis A4 :1476)', () => {
  it('DEBATE_OPENED names the document and its TITLE is the line; ASSESSMENT carries the assertions and the model’s stamp', async () => {
    const out = parse(await open());
    expect(out['record']).toEqual({ commitment: COMMITMENT, title: TITLE });
    const turns = out['turns'] as Row[];
    const opened = turns.find((t) => t['kind'] === 'DEBATE_OPENED');
    expect(opened?.['line']).toBe(TITLE);
    expect((opened?.['body'] as Row)['record']).toEqual({ commitment: COMMITMENT, title: TITLE });
    const assessment = turns.find((t) => t['kind'] === 'ASSESSMENT');
    expect(Object.keys((assessment?.['body'] ?? {}) as Row).sort()).toEqual([
      'assertions', 'assessment', 'hasSubstance', 'malformed', 'objection', 'substanceGaps', 'verdict',
    ]);
    expect(((assessment?.['body'] as Row)['assertions'] as Row[]).map((a) => a['phraseVerified'])).toEqual(['PRESENT', 'ABSENT']);
    expect(assessment?.['by']).toMatchObject({ voice: 'MODEL', model: PROMOTION_ASSESSOR_MODEL(), promptVersion: FORENSIC_PROMOTION_ASSESSMENT_PROMPT_VERSION });
  });

  it('namedRecordOf: the document arm answers { commitment, title }; the capture arm is asked first; none of the three is null', () => {
    const none = { recordSnapshot: null, recordDiff: null };
    expect(namedRecordOf({ ...none, recordDocument: { commitment: COMMITMENT, title: TITLE } })).toEqual({ commitment: COMMITMENT, title: TITLE });
    expect(namedRecordOf({ ...none, recordDocument: null })).toBeNull();
    // A seed written before the key existed carries no `recordDocument` at all — the double answers it as seeded.
    expect(namedRecordOf(none)).toBeNull();
    expect(
      namedRecordOf({ recordSnapshot: { waybackTimestamp: '20220805120000', trackedUrl: { url: 'https://x.il/' } }, recordDiff: null, recordDocument: null }),
    ).toEqual({ url: 'https://x.il/', capture: '20220805120000' });
  });
});

describe('ASSESSMENT turns — `assertions` NULL on a row that lacks the key, NEVER [] (R81 QA); the stamp read when present', () => {
  const voices: Voices = {
    researcher: () => ({ handle: 'חוקר_א', mine: true }),
    model: (model, promptVersion) => ({ model, promptVersion, spentBy: { handle: 'חוקר_א', mine: true } }),
  };
  const turnOf = (content: string): Row => {
    const built = debateTurns(
      {
        id: SESSION,
        researcherId: AUTHOR,
        createdAt: new Date(),
        closedAt: null,
        status: 'OPEN',
        promotedOverObjection: false,
        evidenceFileHash: null,
        record: { commitment: COMMITMENT, title: TITLE },
        pin: HELD_NOW,
        events: [{ id: 'event-1', type: 'ASSESSMENT_RETURNED', content, createdAt: new Date() }],
      },
      voices,
    );
    const turn = built.find((b) => b.turn.kind === 'ASSESSMENT')?.turn;
    if (turn === undefined) throw new Error('no ASSESSMENT turn');
    return turn as unknown as Row;
  };
  const OLD = { hasSubstance: true, substanceGaps: [], verdict: 'SUPPORTS', objection: '', assessment: 'x' };

  it('a row written BEFORE the ruling: assertions null, and the voice names no model — both said, neither invented', () => {
    const turn = turnOf(JSON.stringify(OLD));
    expect((turn['body'] as Row)['assertions']).toBeNull();
    expect(turn['by']).toMatchObject({ model: null, promptVersion: null });
  });

  it('a row whose assessor named none: [] — a real answer, kept', () => {
    expect((turnOf(JSON.stringify({ ...OLD, assertions: [] }))['body'] as Row)['assertions']).toEqual([]);
  });

  it('a JSON row carrying the model and the prompt version: the voice reads both, as ROUND_ASSESSED does', () => {
    const turn = turnOf(JSON.stringify({ ...OLD, assertions: [], model: 'gemini:x', promptVersion: 'v2-document-record-and-assertions' }));
    expect(turn['by']).toMatchObject({ voice: 'MODEL', model: 'gemini:x', promptVersion: 'v2-document-record-and-assertions' });
  });
});

describe('the SAME document arm, re-run — promotion’s blockers and the second round (A4 :1141–:1142; one function)', () => {
  it('promotionBlockers re-checks the document by its INPUT form: a document SHED since the argument blocks SHED', async () => {
    store.session = documentSession({ hasSubstance: true, verdict: 'SUPPORTS' });
    const loaded = await loadDebate(SESSION);
    if (loaded === null) throw new Error('the session did not load');
    expect((await promotionBlockers(loaded)).blockedBy).toEqual([]);

    store.documents = [documentRow({ bytes: null })];
    store.sheds = [{ commitment: COMMITMENT, cause: 'SENDER', researcherId: null, reason: null, at: new Date(Date.UTC(2026, 8, 21)) }];
    const moved = await promotionBlockers(loaded);
    expect(moved.blockedBy).toEqual(['SHED']);
    expect(moved.recordRefusal?.code).toBe('SHED');
  });

  it('STALE_PIN over a document: the head pins a version that is no longer CURRENT(d)', async () => {
    store.session = documentSession({ hasSubstance: true, verdict: 'SUPPORTS' });
    store.mentions = [{ ...store.mentions[0], contentVersionHash: HELD_BEFORE }];
    const loaded = await loadDebate(SESSION);
    if (loaded === null) throw new Error('the session did not load');
    expect((await promotionBlockers(loaded)).blockedBy).toEqual(['STALE_PIN']);
  });

  it('respond_in_debate hands the assessor the document’s round — the same content, the same #doc_ passages', async () => {
    const out = parse(await respondInDebateHandler({ sessionId: SESSION, response: 'הפסקה השנייה מאשרת את הדיווח השבועי.' }));
    expect(out['code']).toBeUndefined();
    expect(handed()).toMatchObject({
      url: null,
      content: { kind: 'DOCUMENT', title: TITLE, reading: { form: 'TEXT', text: CURRENT_TEXT } },
      passages: [
        `החוזר מורה לשמור את ערוץ הדיווח פתוח #doc_${COMMITMENT}`,
        `ובפסקה נוספת: החוזר מורה על דיווח שבועי #doc_${COMMITMENT}`,
      ],
    });
  });

  it('get_debate’s state answers the document record — the one projection', async () => {
    expect((await state(SESSION)).record).toEqual({ commitment: COMMITMENT, title: TITLE });
  });
});
