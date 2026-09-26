import { DOCUMENT_COMMITMENT } from '../../src/lib/anchoredCaptureHash';
import { commitment as commitmentOf, contentVersionHashOf, docId as docIdOf } from '../../src/lib/documentIdentity';
import { readObject } from '../../src/services/documentBucket';
import { Web3Service } from '../../src/services/Web3Service';
import { AFTER, BEFORE, DIFF_NAME, DIFF_ROW, PAGE } from '../helpers/corpusFixture';
import { store, type Row } from '../helpers/evidenceDouble';
import { ATTEMPT, AUTHOR, MENTION, THESIS, VERSION } from '../thesis/fixtures';
import { mentionRow } from '../thesis/rows';
import { AS_PUBLISHED, seedThesis } from '../thesis/tools';
import { documentRow, versionRow } from './citationWorld';

// ---------------------------------------------------------------------------
// AN OPENED DOCUMENT, AS THE PUBLIC READS IT — document step 34 chunk 4a (R85). ONE spelling of the world the public
// block's cases stand on (`test/documentPublicBlock.test.ts`, gating) and the document suite's amended cases
// (`amendedTools`, `invariants`) — so a case in either suite reads the same document.
//
// thesis-1 PUBLISHED at version-1 cites the corpus's diff (promoted, so its page is PUBLIC_PAGE) AND a HELD document
// opened to CONTENT by a decision made before that publication (A4 :1444 as CONFORMED). The document's DOC_ID is its
// bytes' REAL hash and its commitment the REAL `sha256(bytes32(DOC_ID) ‖ salt)`, so a leak of either is a leak of the real
// value. A second document asserting the same page is opened by nobody.
//
// THE IMPORTING FILE DOUBLES THE CHAIN AND THE BUCKET (jest's mocks are per file): `Web3Service` as a `jest.fn` and
// `documentBucket.readObject` — `chain()` and `world()` give each its answer here.
// ---------------------------------------------------------------------------

export const REGISTRAR = '0xus';
export const BYTES = new TextEncoder().encode('the circular, as the researcher gave it');
export const DOC_ID = docIdOf(BYTES);
export const SALT = Buffer.alloc(32, 5);
export const SALT_HEX = SALT.toString('hex');
export const DOC = commitmentOf(DOC_ID, SALT);
export const TEXT = 'the circular instructed that the reporting channel be kept open';
export const PIN = contentVersionHashOf(TEXT, DOC);
export const TITLE = 'חוזר המנכ״ל על ערוץ הדיווח';
export const OPENED_AT = new Date(Date.UTC(2026, 8, 10, 9, 0));
export const PASSAGE_AT = new Date(Date.UTC(2026, 8, 10, 9, 14, 20));
export const BLOCK_TIME = 1_757_400_000;

/** A document nobody opened, beside the opened one — never named by any public read of the first. */
export const SIBLING_BYTES = new TextEncoder().encode('another document of the same hands');
export const SIBLING_DOC_ID = docIdOf(SIBLING_BYTES);
export const SIBLING = commitmentOf(SIBLING_DOC_ID, Buffer.alloc(32, 6));

/** The registrar, holding `entries` — the contract's answers, as `attributeClaim` reads them. */
export function chain(entries: { fileHash: string; submitter: string; category: string }[]): void {
  const registrar = {
    registrarAddress: REGISTRAR,
    isHashRegistered: jest.fn((hash: string) => {
      const index = entries.findIndex((e) => e.fileHash === hash.toLowerCase());
      return Promise.resolve(index === -1 ? { registered: false, evidenceId: BigInt(0) } : { registered: true, evidenceId: BigInt(index) });
    }),
    readEvidenceRecord: jest.fn((index: bigint) => {
      const entry = entries.at(Number(index));
      if (entry === undefined) return Promise.reject(new Error(`no entry at ${String(index)}`));
      return Promise.resolve({ ...entry, timestamp: BLOCK_TIME });
    }),
  };
  (Web3Service as unknown as jest.Mock).mockImplementation(() => registrar);
}

export interface World {
  opening?: 'PASSAGE' | 'CONTENT' | 'BYTES';
  document?: Row;
  version?: Row;
  pin?: string;
  opened?: boolean;
}

export function world(over: World = {}): void {
  seedThesis(AS_PUBLISHED);
  store.attempts = [ATTEMPT];
  // PUBLIC_PAGE (evidencePredicates :434–:449) is a PROMOTED record of the page cited by a version ever published: the
  // published version cites the corpus's diff, promoted — so the register's page is public, as the page body's is.
  store.evidenceRows = [{ fileHash: DIFF_NAME, kind: 'DIFF', status: 'PROMOTED', affirmedContentVersionHash: MENTION.contentVersionHash, snapshot: null, urlVersionDiff: { ...DIFF_ROW, trackedUrlId: PAGE.id, beforeSnapshot: { ...BEFORE, trackedUrl: { url: PAGE.url } }, afterSnapshot: { ...AFTER, trackedUrl: { url: PAGE.url } } } }];
  const pin = over.pin ?? PIN;
  store.documents = [
    documentRow({ docId: DOC_ID, commitment: DOC, salt: SALT, bytes: DOC_ID, title: TITLE, assertedUrl: PAGE.url, assertedAt: new Date(Date.UTC(2022, 7, 5)), ...over.document }),
    documentRow({ docId: SIBLING_DOC_ID, commitment: SIBLING, salt: Buffer.alloc(32, 6), bytes: SIBLING_DOC_ID, title: 'the sibling', assertedUrl: PAGE.url }),
  ];
  store.documentContentVersions = [
    versionRow(pin, { commitment: DOC, text: TEXT, ...over.version }),
    versionRow(contentVersionHashOf('the sibling text', SIBLING), { commitment: SIBLING, text: 'the sibling text' }),
  ];
  store.mentions = [
    ...store.mentions,
    mentionRow({ ...MENTION, id: 'mention-doc', kind: 'DOCUMENT', name: DOC, contentVersionHash: pin }, true),
  ];
  store.documentOpeningDecisions =
    over.opened === false
      ? []
      : [{ id: 'opening-1', thesisId: THESIS.id, commitment: DOC, sequence: 1, opening: over.opening ?? 'CONTENT', researcherId: AUTHOR, createdAt: OPENED_AT }];
  store.passageVerdicts = [{ id: 'verdict-1', versionId: VERSION.id, mentionId: 'mention-doc', phrase: 'the reporting channel', verdict: 'PRESENT', at: PASSAGE_AT }];
  chain([{ fileHash: DOC, submitter: REGISTRAR, category: DOCUMENT_COMMITMENT }]);
  (readObject as jest.Mock).mockImplementation((key: string) => Promise.resolve(key === DOC_ID ? BYTES : null));
}

