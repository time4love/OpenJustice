jest.mock('../src/lib/prisma', () => ({
  prisma: (require('./helpers/evidenceDouble') as typeof import('./helpers/evidenceDouble')).db,
}));
jest.mock('../src/context/researcherContext', () => (require('./thesis/tools') as typeof import('./thesis/tools')).researcherContextDouble);
jest.mock('../src/factories/LLMFactory', () => (require('./thesis/tools') as typeof import('./thesis/tools')).llmFactoryTripwire);
// THE CHAIN AND THE BUCKET, DOUBLED AT THEIR BOUNDARY — the registrar answers as the contract does (`isHashRegistered`,
// `readEvidenceRecord`, `registrarAddress`; `registryState.attributeClaim`), and the bucket answers the held bytes.
jest.mock('../src/services/Web3Service', () => {
  const actual = jest.requireActual<typeof import('../src/services/Web3Service')>('../src/services/Web3Service');
  return { ...actual, Web3Service: jest.fn() };
});
jest.mock('../src/services/documentBucket', () => ({
  ...jest.requireActual<typeof import('../src/services/documentBucket')>('../src/services/documentBucket'),
  readObject: jest.fn(),
}));

import { Prisma } from '@prisma/client';
import { ANCHOR_SCHEME, DOCUMENT_COMMITMENT } from '../src/lib/anchoredCaptureHash';
import { readStanding } from '../src/services/anchorDocuments';
import { openDocumentRegistryWindow } from '../src/services/anchorSnapshots';
import { commitmentEntryOf } from '../src/services/checkOnChainStatus';
import { documentsByCommitment } from '../src/services/documentCitation';
import { publicStandingOf, verifiedOf } from '../src/services/documentStanding';
import { contentVersionHashOf } from '../src/lib/documentIdentity';
import { resolvedRecordOf } from '../src/mcp/tools/resolveRecord';
import { listFindingsHandler } from '../src/mcp/tools/listFindings';
import { readObject } from '../src/services/documentBucket';
import { publishedPageOf } from '../src/services/publicThesisPage';
import { Web3Service } from '../src/services/Web3Service';
import { PAGE } from './helpers/corpusFixture';
import { resetDouble, store } from './helpers/evidenceDouble';
import { AUTHOR, MENTION, THESIS, VERSION } from './thesis/fixtures';
import { mentionRow } from './thesis/rows';
import { resetTools } from './thesis/tools';
import { BLOCK_TIME, chain, DOC, DOC_ID, OPENED_AT, PASSAGE_AT, PIN, REGISTRAR, SALT_HEX, SIBLING, SIBLING_DOC_ID, TITLE, world } from './document/publicWorld';

// ---------------------------------------------------------------------------
// WHAT THE PUBLIC READS OF A DOCUMENT — document flows §7 :844–:864, §9 :1028–:1035 as CONFORMED 2026-09-26 (R85 Q-E),
// A4 :1465–:1467, A7 :1571–:1573; plan step 34 :277–:279, :284–:285; the researcher's Q-A, Q-B, Q-G, M2 (R85).
//
// THREE DOORS, ONE BLOCK: `resolve_record` on a commitment, the public page's DOCUMENT citation, `list_findings`'
// register. Each case is written from §7's lines and never from what the module returns — the WORDS are asserted as the
// design prints them, not as the constants spell them.
//
// THE WORLD: thesis-1 PUBLISHED at version-1 (ATTEMPT), which cites the corpus's diff AND a HELD document opened to
// CONTENT by a decision made before that publication (A4 :1444 as CONFORMED). The document's DOC_ID is its bytes' real
// hash and its commitment the real `sha256(bytes32(DOC_ID) ‖ salt)`, so a leak of either is a leak of the real value.
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetDouble();
  resetTools();
  jest.clearAllMocks();
});

/** `resolve_record`'s answer for a name, as a plain object. */
async function resolve(name: string): Promise<Record<string, unknown>> {
  return JSON.parse(JSON.stringify(await resolvedRecordOf({ fileHash: name }))) as Record<string, unknown>;
}

/** The public page's DOCUMENT citation. */
async function pageArm(): Promise<Record<string, unknown>> {
  const page = JSON.parse(JSON.stringify(await publishedPageOf(THESIS.id))) as { citations?: Record<string, unknown>[] };
  const arm = (page.citations ?? []).find((c) => c['kind'] === 'DOCUMENT');
  if (arm === undefined) throw new Error('the public page carries no DOCUMENT citation');
  return arm;
}

/** `list_findings`' register on the page the document asserts. */
async function register(): Promise<Record<string, unknown>[]> {
  const out = JSON.parse(await listFindingsHandler({ url: PAGE.url })) as { documents?: Record<string, unknown>[] };
  if (out.documents === undefined) throw new Error(`list_findings carries no \`documents\` register: ${JSON.stringify(out).slice(0, 300)}`);
  return out.documents;
}

/** Every key at every depth of a JSON value. */
function keysDeep(value: unknown): Set<string> {
  const keys = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object' && v !== null) {
      for (const [k, inner] of Object.entries(v)) {
        keys.add(k);
        walk(inner);
      }
    }
  };
  walk(value);
  return keys;
}

describe('§7 :848–:858 — resolve_record on a commitment answers THE BLOCK (A4 :1466–:1467)', () => {
  it('B1 every field of the block, by custody HELD — the design’s words verbatim beside each code (M2)', async () => {
    world();
    const before = Date.now();
    const block = await resolve(DOC);
    const verification = block['verification'] as Record<string, unknown>;
    const at = Date.parse(String(verification['at']));
    expect(at).toBeGreaterThanOrEqual(before);
    expect(block).toEqual({
      kind: 'DOCUMENT',
      commitment: DOC,
      title: TITLE,
      custody: 'HELD',
      registry: { attestedBy: 'COMMITMENT', registryIndex: 0, blockTime: new Date(BLOCK_TIME * 1000).toISOString(), capture: null },
      verification: {
        mode: 'HELD',
        verified: true,
        at: verification['at'],
        says: 'the bytes the platform holds hash to the name, now; a third party timestamped a commitment to it',
        doesNotSay: ['that the bytes are authentic, complete, unaltered, or from whom'],
      },
      secondWitness: { code: 'NONE', words: 'none — the archive is absent, and the flag reads so' },
      opening: 'CONTENT',
      citedBy: [
        {
          thesisId: THESIS.id,
          versionId: VERSION.id,
          pin: PIN,
          passages: { stamp: 'PUBLICATION', rows: [{ phrase: 'the reporting channel', verdict: 'PRESENT', at: PASSAGE_AT.toISOString() }] },
          requests: [],
          argued: false,
          overObjection: false,
          flag: { flagged: false, reasons: [] },
        },
      ],
    });
    // Q-B: VERIFIED(d) RECOMPUTED on this read — the bucket was read for the HELD arm.
    expect(readObject).toHaveBeenCalledWith(DOC_ID);
  });

  it('B1 VERIFIED is FALSE when the held bytes no longer hash to the name — recomputed, never assumed', async () => {
    world();
    (readObject as jest.Mock).mockResolvedValue(new TextEncoder().encode('other bytes'));
    const block = await resolve(DOC);
    expect((block['verification'] as Record<string, unknown>)['verified']).toBe(false);
  });

  it('B1 a chain that will not answer is a verdict about the CHECK — registry unavailable, VERIFIED false, the read served', async () => {
    world();
    (Web3Service as unknown as jest.Mock).mockImplementation(() => {
      throw new Error('rpc down');
    });
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const block = await resolve(DOC);
    expect(block['registry']).toEqual({ unavailable: 'CHAIN_UNAVAILABLE' });
    expect((block['verification'] as Record<string, unknown>)['verified']).toBe(false);
    expect(JSON.stringify(block)).not.toContain('rpc down');
  });

  it('B1 a REQUEST ON RECORD (§7 :853): a gap REQUESTED and then decided CITED on the document carries the request beside the answer', async () => {
    world();
    const request = { to: 'משרד הבריאות', text: 'בקשת חופש מידע' };
    store.gapDecisions = [
      { id: 'g1', thesisId: THESIS.id, versionId: VERSION.id, gapId: 'gap-1', description: 'the circular', sequence: 1, decision: 'REQUESTED', citedName: null, request, callItem: null, reason: null, researcherId: AUTHOR, createdAt: OPENED_AT },
      { id: 'g2', thesisId: THESIS.id, versionId: VERSION.id, gapId: 'gap-1', description: 'the circular', sequence: 2, decision: 'CITED', citedName: DOC, request: null, callItem: null, reason: null, researcherId: AUTHOR, createdAt: OPENED_AT },
      { id: 'g3', thesisId: THESIS.id, versionId: VERSION.id, gapId: 'gap-2', description: 'another', sequence: 1, decision: 'CITED', citedName: DOC, request: null, callItem: null, reason: null, researcherId: AUTHOR, createdAt: OPENED_AT },
    ];
    const block = await resolve(DOC);
    const citing = (block['citedBy'] as Record<string, unknown>[]).at(0);
    expect(citing?.['requests']).toEqual([{ gapId: 'gap-1', request }]);
  });

  it('B1 the CAPTURE ARM (A3 :1366 as ruled; A4 :1469): an equal, attributed capture attests — the block names its page and capture, NEVER the entry’s hash, which is the DOC_ID', async () => {
    world();
    const digest = DOC_ID.slice(2);
    store.captures = [{ id: 'snap-eq', trackedUrlId: PAGE.id, documentHash: digest, waybackTimestamp: '20220805053301', trackedUrl: { url: PAGE.url } }];
    chain([{ fileHash: DOC_ID, submitter: REGISTRAR, category: ANCHOR_SCHEME }]);
    const block = await resolve(DOC);
    expect(block['registry']).toEqual({ attestedBy: 'CAPTURE', registryIndex: 0, blockTime: new Date(BLOCK_TIME * 1000).toISOString(), capture: { url: PAGE.url, capture: '20220805053301' } });
    expect(JSON.stringify(block).includes(digest)).toBe(false);
  });

  it('B1 a DRAFT citing the document is NOT among the citing versions — the public reads carry PUBLISHED versions only (evidence A4 :1107–:1108)', async () => {
    world();
    store.mentions = [
      ...store.mentions,
      mentionRow({ ...MENTION, id: 'mention-draft', versionId: 'version-draft', kind: 'DOCUMENT', name: DOC, contentVersionHash: PIN }, false),
    ];
    const citedBy = (await resolve(DOC))['citedBy'] as Record<string, unknown>[];
    expect(citedBy.map((c) => c['versionId'])).toEqual([VERSION.id]);
  });

  it('B2 THE NOT LIST (§7 :859–:860) — no DOC_ID, no salt, as a key OR a value, EVEN AT BYTES; no opinion; no sibling; no sender', async () => {
    for (const opening of ['CONTENT', 'BYTES'] as const) {
      resetDouble();
      world({ opening });
      const block = await resolve(DOC);
      // THE FLOOR: a refusal carries none of these either, so the case holds nothing unless the answer IS a block.
      expect([block['kind'], block['opening']]).toEqual(['DOCUMENT', opening]);
      const text = JSON.stringify(block);
      const keys = keysDeep(block);
      expect([...keys].filter((k) => /^(docId|salt|opinion|opinions|arrival|arrivals|arrivalId|researcherId|sender|by)$/i.test(k))).toEqual([]);
      expect([text.includes(DOC_ID), text.includes(DOC_ID.slice(2)), text.includes(SALT_HEX)]).toEqual([false, false, false]);
      expect([text.includes(SIBLING), text.includes(SIBLING_DOC_ID)]).toEqual([false, false]);
    }
  });

  it('B2c A BYTES-ONLY document (Q-G): its pin is the COMMITMENT, and NO public read — block, page body, history, register — carries the DOC_ID as a value', async () => {
    const pin = contentVersionHashOf(null, DOC);
    world({ pin, version: { text: null } });
    expect(pin).toBe(DOC);
    const reads = [
      JSON.stringify(await resolve(DOC)),
      JSON.stringify(await publishedPageOf(THESIS.id)),
      JSON.stringify(await register()),
    ];
    for (const text of reads) {
      expect([text.includes(DOC_ID), text.includes(DOC_ID.slice(2)), text.includes(SALT_HEX)]).toEqual([false, false, false]);
    }
    expect(reads.at(1)).toContain(DOC);
  });

  it('B3 SEALED: the notice ALWAYS, verbatim (§7 :856–:858); verified at receipt; both "does NOT say" cells as the table prints them', async () => {
    const receipt = new Date(Date.UTC(2026, 8, 3));
    world({ document: { bytes: null, cid: 'bafy-sealed', verifiedAtReceipt: receipt }, version: { derivedFrom: 'AT_RECEIPT' } });
    const block = await resolve(DOC);
    expect(block['notice']).toEqual({
      code: 'SEALED_DERIVED_ONCE',
      words:
        "the platform derived this text once, at receipt; nothing can derive it again, and what the thesis says of the document's appearance rests on a model's reading the platform cannot repeat",
    });
    expect(block['verification']).toEqual({
      mode: 'SEALED',
      verified: true,
      at: receipt.toISOString(),
      says: 'the platform verified the name once, at receipt, and committed to it on chain by that block; a key holder could re-verify, if §5 gives it one',
      doesNotSay: ['that the bytes are authentic, complete, unaltered, or from whom', 'the same — and that the platform can check anything again'],
    });
    expect(block['secondWitness']).toEqual({ code: 'NONE', words: 'none' });
    expect(readObject).not.toHaveBeenCalled();
  });

  it('B3 HELD carries NO notice key — the notice is by custody, never per assertion', async () => {
    world();
    const block = await resolve(DOC);
    expect([block['kind'], 'notice' in block]).toEqual(['DOCUMENT', false]);
  });

  it('B4 NOT_PUBLIC for a held document no published version opened (§7 :864); NOT_A_RECORD for a name nothing holds, and for a `doc_`-prefixed one', async () => {
    world({ opened: false });
    expect((await resolve(DOC))['code']).toBe('NOT_PUBLIC');
    expect((await resolve('0x' + 'ee'.repeat(32)))['code']).toBe('NOT_A_RECORD');
    expect((await resolve(`doc_${DOC}`))['code']).toBe('NOT_A_RECORD');
  });

  it('B5 the passages are a STAMP of publication — read from PassageVerdict with its moment, oldest first (A3 :1389–:1391)', async () => {
    world();
    store.passageVerdicts = [
      { id: 'verdict-2', versionId: VERSION.id, mentionId: 'mention-doc', phrase: 'kept open', verdict: 'ABSENT', at: new Date(PASSAGE_AT.getTime() + 1000) },
      ...store.passageVerdicts,
    ];
    const citing = ((await resolve(DOC))['citedBy'] as Record<string, unknown>[]).at(0);
    expect(citing?.['passages']).toEqual({
      stamp: 'PUBLICATION',
      rows: [
        { phrase: 'the reporting channel', verdict: 'PRESENT', at: PASSAGE_AT.toISOString() },
        { phrase: 'kept open', verdict: 'ABSENT', at: new Date(PASSAGE_AT.getTime() + 1000).toISOString() },
      ],
    });
  });
});

describe('the public page’s DOCUMENT citation — thesis A4 :1476’s V arm, plus §7’s block (R81 QC; Q-A)', () => {
  it('B6 the arm is the V shape — `verified` present — and `document` IS the block resolve_record answers (one composer)', async () => {
    world();
    const arm = await pageArm();
    expect(Object.keys(arm).sort()).toEqual(['argued', 'custody', 'document', 'flag', 'kind', 'name', 'overObjection', 'pin', 'title', 'verified'].sort());
    expect([arm['name'], arm['pin'], arm['custody'], arm['title'], arm['verified']]).toEqual([DOC, PIN, 'HELD', TITLE, true]);
    const strip = (block: unknown): unknown => ({ ...(block as Record<string, unknown>), verification: { ...((block as Record<string, Record<string, unknown>>)['verification']), at: 'the read' } });
    expect(strip(arm['document'])).toEqual(strip(await resolve(DOC)));
  });
});

describe('list_findings’ `documents` register — OPENED only (A4 :1465; §9 :1031–:1035 as CONFORMED, R85 Q-E)', () => {
  it('B7 the opened document asserting the page, in §9’s shape WITH its title — and the unopened one beside it absent', async () => {
    world();
    expect(await register()).toEqual([
      {
        commitment: DOC,
        title: TITLE,
        assertions: { assertedAt: '2022-08-05' },
        custody: 'HELD',
        anchored: true,
        content: { contentVersionHash: PIN },
        equalsCapture: null,
        opening: 'CONTENT',
        citedBy: [{ thesisId: THESIS.id, published: true }],
      },
    ]);
  });

  it('B7 nothing is registered for a page whose documents nobody opened — for anyone', async () => {
    world({ opened: false });
    expect(await register()).toEqual([]);
  });
});

describe('opinions-not-facts, EXTENDED over every public read of a document (A7 :1571–:1573; plan :284–:285)', () => {
  // THE PROPERTY, over KEYS: no field of a `DocumentOpinion` — computed from the model's own field list, so a field added
  // to the opinion tomorrow is covered — and no `opinion` key, at any depth. The block, the page's arm, the register here;
  // `/content` and `/bytes` at chunk 4b.
  const OPINION_KEYS = [
    'opinion',
    'opinions',
    ...Object.keys(Prisma.DocumentOpinionScalarFieldEnum).filter((key) => !['id', 'versionId', 'createdAt', 'researcherId'].includes(key)),
  ];
  const opinionKeysIn = (value: unknown): string[] => [...keysDeep(value)].filter((key) => OPINION_KEYS.includes(key));

  it('B8 the FLOOR — the opinion’s own fields are known, so the property has a subject', () => {
    expect(OPINION_KEYS).toEqual(expect.arrayContaining(['opinion', 'model', 'promptVersion', 'body']));
  });

  it('B8 DETECTS a planted opinion field — the decoy this rule needs to be real', () => {
    expect(opinionKeysIn({ kind: 'DOCUMENT', citedBy: [{ opinion: { model: 'm', body: {} } }] })).toEqual(['opinion', 'model', 'body']);
  });

  it('B8 no opinion field in resolve_record’s block, the page’s DOCUMENT arm, or the register', async () => {
    world();
    expect(opinionKeysIn(await resolve(DOC))).toEqual([]);
    expect(opinionKeysIn(await pageArm())).toEqual([]);
    expect(opinionKeysIn(await register())).toEqual([]);
  });
});


describe('M3 — ONE rule for ANCHORED’s chain half (A3 :1366 as ruled; A4 :1469): the gate, the block and check_on_chain_status agree', () => {
  const EQUAL_CAPTURE = '20220805053301';
  /** The world, with the document's bytes equal to a capture's (EQUALS_CAPTURE, A3 :1383) and the registry holding `entries`. */
  function equalWorld(entries: { fileHash: string; submitter: string; category: string }[]): void {
    world();
    store.captures = [{ id: 'snap-eq', trackedUrlId: PAGE.id, documentHash: DOC_ID.slice(2), waybackTimestamp: EQUAL_CAPTURE, trackedUrl: { url: PAGE.url } }];
    chain(entries);
  }

  /** What each of the three readers says attests the document, and whether VERIFIED(d) holds. */
  async function threeReaders(): Promise<{ block: unknown; gate: unknown; standing: unknown; tool: unknown }> {
    const cited = await documentsByCommitment([DOC]);
    const pub = (await publicStandingOf(cited)).get(DOC);
    const gate = (await verifiedOf(cited)).get(DOC);
    const standing = await readStanding(openDocumentRegistryWindow(), { commitment: DOC, docId: DOC_ID, held: true });
    // `check_on_chain_status`'s commitment arm answers this function's attestation, whole (`commitmentOnChain`).
    const held = cited.get(DOC);
    if (held === undefined) throw new Error('the world holds no document');
    const tool = await commitmentEntryOf(held.document, held.shed);
    return {
      block: pub === undefined || !('attestation' in pub) ? pub : { by: pub.attestation.attestedBy, verified: pub.verified },
      gate,
      standing: { by: standing.by, anchored: standing.anchored },
      tool: { by: tool.attestedBy, capture: tool.capture?.capture ?? null },
    };
  }

  it('M3 a commitment REGISTERED BY ANOTHER SUBMITTER and an ATTRIBUTED equal capture: anchored BY THE CAPTURE, in all three', async () => {
    equalWorld([
      { fileHash: DOC, submitter: '0xsomeone-else', category: DOCUMENT_COMMITMENT },
      { fileHash: DOC_ID, submitter: REGISTRAR, category: ANCHOR_SCHEME },
    ]);
    expect(await threeReaders()).toEqual({
      block: { by: 'CAPTURE', verified: true },
      gate: { verified: true },
      standing: { by: 'CAPTURE', anchored: true },
      tool: { by: 'CAPTURE', capture: EQUAL_CAPTURE },
    });
  });

  it('M3 where BOTH attest, the commitment STANDS — "a commitment written before the equality appeared stands" (A3 :1366): COMMITMENT, in all three', async () => {
    equalWorld([
      { fileHash: DOC, submitter: REGISTRAR, category: DOCUMENT_COMMITMENT },
      { fileHash: DOC_ID, submitter: REGISTRAR, category: ANCHOR_SCHEME },
    ]);
    expect(await threeReaders()).toEqual({
      block: { by: 'COMMITMENT', verified: true },
      gate: { verified: true },
      standing: { by: 'COMMITMENT', anchored: true },
      tool: { by: 'COMMITMENT', capture: null },
    });
  });
});
