import { built } from './built';
import type { DocumentContentVersionRow, DocumentRow, ShedRow } from './contract';
import { FIXTURE_KINDS, KIND_EXPECTATION, held, sealed, shedRow, version } from './fixtures';

// ---------------------------------------------------------------------------
// §3 :269-:373, A2 :1296-:1305, A3 :1368-:1371 — CONTENT IS A VERSION.
//
// CURRENT differs by mode and the record says which. A SEALED document is the one record
// in the corpus whose content can never move under the platform's own hand: a better OCR
// engine improves every HELD scan and no sealed one, and the design states that as a COST
// rather than hiding it (§3 :339-:342).
// ---------------------------------------------------------------------------

interface Content {
  currentVersion: (
    document: DocumentRow,
    versions: readonly DocumentContentVersionRow[],
    currentExtractor: string,
    shed: ShedRow | null,
  ) => DocumentContentVersionRow | { awaiting: true } | { shed: true };
}

const content = () => built<Content>('services/documentPredicates', ['currentVersion']);

const AWAITING = { awaiting: true };
const SHED = { shed: true };

describe('A3 :1368-:1371 — CURRENT(d), HELD', () => {
  it('the version whose extractorVersion is CURRENT_EXTRACTOR', async () => {
    const { currentVersion } = await content();
    const now = version({ extractorVersion: 'v2', derivedFrom: 'HELD_BYTES' });
    const old = version({ id: 'dcv_0', extractorVersion: 'v1', contentVersionHash: '0x' + '00'.repeat(32) });
    expect(currentVersion(held(), [old, now], 'v2', null)).toEqual(now);
  });

  it('NONE under the current extractor is AWAITING_DERIVATION — evidence A3’s name, ONE SPELLING', async () => {
    const { currentVersion } = await content();
    expect(currentVersion(held(), [version({ extractorVersion: 'v1' })], 'v2', null)).toEqual(AWAITING);
  });

  it('a document with NO version at all is AWAITING, not an empty answer', async () => {
    const { currentVersion } = await content();
    expect(currentVersion(held(), [], 'v1', null)).toEqual(AWAITING);
  });
});

describe('A3 :1370 — CURRENT(d), SEALED: the AT_RECEIPT version, FOREVER', () => {
  it('the AT_RECEIPT version is current whatever the extractor has moved to', async () => {
    const receipt = version({ derivedFrom: 'AT_RECEIPT', extractorVersion: 'v1' });
    const { currentVersion } = await content();
    expect(currentVersion(sealed(), [receipt], 'v9', null)).toEqual(receipt);
  });

  it('a SEALED document NEVER reads AWAITING — there are no bytes to derive from (§3 :349)', async () => {
    const { currentVersion } = await content();
    expect(currentVersion(sealed(), [version({ derivedFrom: 'AT_RECEIPT' })], 'v9', null)).not.toEqual(AWAITING);
  });

  it('a HELD_BYTES version on a SEALED document is IGNORED — nothing can derive one (A2 :1131 of §11)', async () => {
    const receipt = version({ derivedFrom: 'AT_RECEIPT' });
    const later = version({ id: 'dcv_2', derivedFrom: 'HELD_BYTES', extractorVersion: 'v9' });
    const { currentVersion } = await content();
    expect(currentVersion(sealed(), [receipt, later], 'v9', null)).toEqual(receipt);
  });
});

describe('A3 :1371 — CURRENT(d), NONE: undefined, and the failure names SHED and never AWAITING', () => {
  it('a shed document is SHED, which is a different answer from AWAITING', async () => {
    const { currentVersion } = await content();
    expect(currentVersion(held({ bytes: null }), [], 'v1', shedRow())).toEqual(SHED);
  });

  it('SHED wins over a version row that still exists — its text was nulled, the row was kept (A2 :1305)', async () => {
    const { currentVersion } = await content();
    const hollow = version({ text: null, opinion: null });
    expect(currentVersion(held({ bytes: null }), [hollow], 'v1', shedRow())).toEqual(SHED);
  });
});

describe('A2 :1304 — a re-derivation with IDENTICAL text is not a new row', () => {
  it('two versions with one contentVersionHash are one version, and CURRENT resolves to it', async () => {
    const { currentVersion } = await content();
    const one = version({ extractorVersion: 'v2', derivedFrom: 'HELD_BYTES' });
    const same = { ...one, id: 'dcv_dup' };
    expect(currentVersion(held(), [one, same], 'v2', null)).toEqual(expect.objectContaining({
      contentVersionHash: one.contentVersionHash,
    }));
  });
});

describe('§3 :280-:286 as AMENDED :284 — the FIVE kinds, and which yield COMPUTED text', () => {
  it('the fixture set is FIVE, and the spreadsheet is COMPUTED and not the "none of the above" row', () => {
    // THE FLOOR: five kinds, not "at least one".
    expect(FIXTURE_KINDS).toHaveLength(5);
    expect(KIND_EXPECTATION.SPREADSHEET.computed).toBe(true);
  });

  it('exactly ONE kind is bytes-only, and it is counted as bytes-only and NEVER as a failure (plan :169-:170)', () => {
    const bytesOnly = FIXTURE_KINDS.filter((kind) => !KIND_EXPECTATION[kind].computed);
    expect(bytesOnly).toEqual(['PHOTOGRAPH']);
  });

  it('every kind states what it PROVES — a fixture that proves nothing is a fixture nobody can grade', () => {
    for (const kind of FIXTURE_KINDS) expect(KIND_EXPECTATION[kind].proves.length).toBeGreaterThan(20);
  });
});
