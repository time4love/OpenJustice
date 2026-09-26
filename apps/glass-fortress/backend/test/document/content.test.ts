import { extract } from '../../src/lib/documentExtractor';
import { built } from './built';
import type { DocumentContentVersionRow, DocumentRow, ShedRow } from './contract';
import { FIXTURES, FIXTURE_KINDS } from '../documentFixtureBytes';
import { held, sealed, shedRow, version } from './fixtures';

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
  it('the version with a derivation row for CURRENT_EXTRACTOR — MEMBERSHIP, never equality (A3 :1368, ruled 2026-09-23; rows since Q-R1)', async () => {
    const { currentVersion } = await content();
    const now = version({ extractorVersion: 'v2', derivedFrom: 'HELD_BYTES' });
    const old = version({ id: 'dcv_0', extractorVersion: 'v1', contentVersionHash: '0x' + '00'.repeat(32) });
    expect(currentVersion(held(), [old, now], 'v2', null)).toEqual(now);
  });

  it('a version a NEW extractor REPRODUCED is current, though its extractorVersion is the OLD one', async () => {
    // THE CASE THE RULING EXISTS FOR. §3 :317 forbids a second row for a re-derivation
    // that yields identical text, so under the old equality rule NO row could carry the
    // new extractor: CURRENT(d) read AWAITING_DERIVATION for ever while the pass reported
    // UNCHANGED, and A6 :1531 is HARD — the document was permanently uncitable.
    const { currentVersion } = await content();
    // DECLARED EDIT, step 34 chunk 5-0 (Q-R1): the list is two DocumentContentDerivation rows, no longer a column.
    const reproduced = version({
      extractorVersion: 'v1',
      derivations: [
        { extractorVersion: 'v1', at: new Date('2026-09-20T09:00:01.000Z') },
        { extractorVersion: 'v2', at: new Date('2026-09-24T09:00:01.000Z') },
      ],
    });
    expect(currentVersion(held(), [reproduced], 'v2', null)).toEqual(reproduced);
    // And `extractorVersion` still names the extractor that produced it FIRST.
    expect(reproduced.extractorVersion).toBe('v1');
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
    const hollow = version({ text: null });
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

// ---------------------------------------------------------------------------
// §3 :280-:286 AS AMENDED :283 AND :284 — THE FOUR KINDS.
//
// WHAT WAS HERE AND WHY IT WAS WORSE THAN RED. Three cases asserted the SUPERSEDED FIVE,
// `PASTE` among them, against a hand-kept map in `./fixtures` — and they were GREEN. flows
// :283 retired the paste as a KIND on 2026-09-23 and `gf-refactor-plan.md` §4 rule 1 says a
// test asserting a retired concept is DELETED in the commit that retires it; that commit was
// docs-only. A suite asserting a retired concept and PASSING reports that the retirement did
// not happen.
//
// THE KINDS NOW COME FROM THE GENERATOR that authors the committed bytes, so there is ONE
// spelling in the tree. And "which kinds yield COMPUTED text" is asked OF THE READER over
// those bytes, not read off a map somebody maintains: a `computed: true` nobody re-measures
// is a claim about a reader that no reader ever made. It is round 2's guard's shape, in the
// project whose job is the appendix.
// ---------------------------------------------------------------------------

describe('§3 :283-:284 — the FOUR kinds, and which yield COMPUTED text', () => {
  it('the set is FOUR, the paste is GONE, and this suite reads the SAME list the generator authors', () => {
    // THE FLOOR AND THE CEILING: four, not "at least one", and not five.
    expect(FIXTURE_KINDS).toHaveLength(4);
    expect(FIXTURE_KINDS).toEqual(['PDF_TEXT_LAYER', 'SCAN', 'SPREADSHEET', 'UNREADABLE']);
    // The retired concept, named so a reinstatement fails HERE rather than in a count.
    expect(FIXTURE_KINDS).not.toContain('PASTE');
    // ONE SPELLING: the list and the files the generator actually writes are the same set.
    expect(FIXTURES.map((fixture) => fixture.kind)).toEqual([...FIXTURE_KINDS]);
  });

  it('TWO kinds are bytes-only under `ocr-none`, and the reader says so — not a map', async () => {
    // THE OLD CASE SAID "exactly ONE kind is bytes-only ... ['PHOTOGRAPH']" AND WAS FALSE.
    // Under the ruling of 2026-09-23 a SCAN derives no text either, so two are bytes-only,
    // and the photograph is now an AUDIO file whose type no reader is selected for. Both are
    // counted as bytes-only and NEVER as a failure (plan :169-:170).
    //
    // THE PDF IS NOT ASKED HERE, and the reason is the harness rather than the reader:
    // `pdfjs-dist` 6.3.289 is ESM-only and jest's loader cannot take it — three mechanisms
    // measured failing, recorded in `src/lib/documentExtractor.ts`'s header. Its answer is
    // held by `test/documentPdfProcess.test.ts`, which runs the COMPILED reader in a child
    // `node`. Named, never implied.
    const loadable = FIXTURES.filter((fixture) => fixture.mimeType !== 'application/pdf');
    expect(loadable).toHaveLength(3);

    const answers = await Promise.all(
      loadable.map(async (fixture) => ({
        kind: fixture.kind,
        computed: (await extract(fixture.bytes(), fixture.mimeType)).text !== null,
      })),
    );

    expect(answers.filter((answer) => !answer.computed).map((answer) => answer.kind)).toEqual([
      'SCAN',
      'UNREADABLE',
    ]);
    // And the floor the other way, so a blinded reader cannot satisfy it: the SPREADSHEET
    // really does yield computed text, which is :284's own amendment.
    expect(answers.filter((answer) => answer.computed).map((answer) => answer.kind)).toEqual(['SPREADSHEET']);
  }, 30000);

  it('every kind states what it PROVES — a fixture that proves nothing is a fixture nobody can grade', () => {
    for (const fixture of FIXTURES) expect(fixture.proves.length).toBeGreaterThan(20);
  });
});
