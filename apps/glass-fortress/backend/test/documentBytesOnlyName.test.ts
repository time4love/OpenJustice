jest.mock('../src/lib/prisma', () => (require('./document/world') as typeof import('./document/world')).prismaDouble);
jest.mock('../src/services/documentBucket', () => (require('./document/world') as typeof import('./document/world')).bucketDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./document/world') as typeof import('./document/world')).llmDouble);
// THE CHAIN IS NOT THIS FILE'S SUBJECT: a registrar that cannot be built leaves the receipt OWED (§4 :444–:447), which
// is an answer, and no case below reads it.
jest.mock('../src/services/Web3Service', () => {
  const actual = jest.requireActual<typeof import('../src/services/Web3Service')>('../src/services/Web3Service');
  return {
    ...actual,
    Web3Service: jest.fn(() => {
      throw new Error('no chain in this suite');
    }),
  };
});

import { commitment as commitmentOf } from '../src/lib/documentIdentity';
import { addDocument, type AddDocumentAnswer } from '../src/services/addDocument';
import { rederiveDocuments } from '../src/services/rederiveDocuments';
import { fixture, objects, resetWorld, seedArrival, seedDocument, seedObject, seedResearcher, store } from './document/world';

// ---------------------------------------------------------------------------
// A BYTES-ONLY VERSION IS NAMED BY THE COMMITMENT, NEVER BY THE DOC_ID — docs/gf-document-flows.md A1 :1243 and §3 :323,
// :293, as CONFORMED 2026-09-26 (the researcher, R85 Q-G); §7 :765–:770: "no hash of a copy a source held is ever
// published". The pin is served at every opening (§7 :777–:779, :851), so a bytes-only version hashed to its DOC_ID
// published the DOC_ID below BYTES.
//
// THE HASH FUNCTION RETURNS WHAT IT IS HANDED, so the rule lives in what each CALLER hands it. There are three writers of
// a derivation, and each is held here by name: the first arrival, a later arrival of a document still owed, and the
// re-derivation pass. The world is the UNREADABLE fixture — a WAV, which no reader takes (§3 :284's fourth row), so its
// version's text is null. Each case asserts that FLOOR first, or it would hold the text arm and prove nothing.
// ---------------------------------------------------------------------------

const WAV = fixture('UNREADABLE');
const TITLE = 'the recording';

const isAnswer = (a: unknown): a is AddDocumentAnswer => typeof (a as AddDocumentAnswer).commitment === 'string';

beforeEach(() => {
  resetWorld();
  seedResearcher('res_1', 'researcher');
  seedObject(WAV.docId, WAV.bytes);
});

/** The one version the world holds for `commitment` — its text and its hash. */
function versionOf(commitment: string): { text: unknown; contentVersionHash: unknown } {
  const rows = store.versions.filter((v) => v['commitment'] === commitment);
  expect(rows).toHaveLength(1);
  const [row] = rows;
  if (row === undefined) throw new Error('no version was written');
  return { text: row['text'], contentVersionHash: row['contentVersionHash'] };
}

describe('Q-G — a bytes-only content version is named by the COMMITMENT (A1 :1243 as CONFORMED 2026-09-26)', () => {
  it('B2b the FIRST arrival: add_document of a file no reader takes writes a version whose hash is the commitment, never the DOC_ID', async () => {
    const answer = await addDocument({ docId: WAV.docId, title: TITLE, mimeType: WAV.mimeType }, 'res_1');
    if (!isAnswer(answer)) throw new Error(`add_document refused: ${JSON.stringify(answer)}`);
    const version = versionOf(answer.commitment);
    expect(version.text).toBeNull();
    expect(version.contentVersionHash).toBe(answer.commitment);
    expect(version.contentVersionHash).not.toBe(WAV.docId);
    expect(answer.content?.contentVersionHash).toBe(answer.commitment);
  });

  it('B2b a LATER arrival of a document still owed its derivation hands the STORED commitment', async () => {
    const salt = Buffer.alloc(32, 7);
    const commitment = commitmentOf(WAV.docId, salt);
    seedDocument({ docId: WAV.docId, commitment, salt, bytes: WAV.docId, mimeType: WAV.mimeType, byteLength: WAV.byteLength, title: TITLE });
    seedArrival('res_1', commitment);
    const answer = await addDocument({ docId: WAV.docId, title: TITLE, mimeType: WAV.mimeType }, 'res_1');
    if (!isAnswer(answer)) throw new Error(`add_document refused: ${JSON.stringify(answer)}`);
    expect(answer.existed).toBe(true);
    const version = versionOf(commitment);
    expect(version.text).toBeNull();
    expect([version.contentVersionHash === commitment, version.contentVersionHash === WAV.docId]).toEqual([true, false]);
  });

  it('B2b the RE-DERIVATION pass hands the document’s commitment', async () => {
    const salt = Buffer.alloc(32, 9);
    const commitment = commitmentOf(WAV.docId, salt);
    seedDocument({ docId: WAV.docId, commitment, salt, bytes: WAV.docId, mimeType: WAV.mimeType, byteLength: WAV.byteLength, title: TITLE });
    const report = await rederiveDocuments((document) => Promise.resolve(objects.get(document.docId)?.bytes ?? null));
    expect(report.outcomes.map((o) => o.outcome)).toEqual(['SUPERSEDED']);
    const version = versionOf(commitment);
    expect(version.text).toBeNull();
    expect([version.contentVersionHash === commitment, version.contentVersionHash === WAV.docId]).toEqual([true, false]);
  });
});
