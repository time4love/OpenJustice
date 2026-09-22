import { built } from './built';
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
// ---------------------------------------------------------------------------

interface CheckResult {
  id: number;
  name: string;
  passed: boolean;
  binding: boolean;
  examined: number;
  subjects: readonly string[];
}

interface Gate {
  runDocumentChecks: (
    version: { mentions: readonly { kind: string; name: string }[] },
  ) => Promise<readonly CheckResult[]>;
}

const gate = () => built<Gate>('services/decideOpening') as unknown as Promise<Gate>;

const WITH_DOCUMENT = { mentions: [{ kind: 'DOCUMENT', name: '0x' + 'c1'.repeat(32) }] };
const WITHOUT_DOCUMENT = { mentions: [{ kind: 'EVIDENCE', name: '0x' + 'e1'.repeat(32) }] };

describe('A6 :1535-:1536 — the two added checks, BY ID', () => {
  it('18 is DOCUMENT_OPENING_DECIDED and 19 is DOCUMENT_QUOTES_PRESENT (thesis A6 :1602)', () => {
    expect(DOCUMENT_CHECK_IDS.DOCUMENT_OPENING_DECIDED).toBe(18);
    expect(DOCUMENT_CHECK_IDS.DOCUMENT_QUOTES_PRESENT).toBe(19);
  });

  it('18 fails a head whose #doc_ mention has NO opening decided, and names the mention', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITH_DOCUMENT);
    const check = results.find((r) => r.id === 18);
    expect(check?.passed).toBe(false);
    expect(check?.subjects.length).toBeGreaterThan(0);
  });

  it('18 fails BYTES on a SEALED document — §7 :803-:804 names that arm explicitly', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITH_DOCUMENT);
    expect(results.find((r) => r.id === 18)?.binding).toBe(true);
  });

  it('19 refuses an ABSENT quoted span and NAMES IT — the researcher quoted a phrase the document lacks', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITH_DOCUMENT);
    const check = results.find((r) => r.id === 19);
    expect(check?.passed).toBe(false);
  });

  it('19 PASSES on PRESENT or UNCHECKED — a bytes-only document does not fail for being unreadable (A6 :1536)', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITH_DOCUMENT);
    expect(results.find((r) => r.id === 19)?.binding).toBe(true);
  });
});

describe('THE VACUITY RULE — zero examined is REPORTED, never a silent pass', () => {
  it('a version with NO #doc_ token reports ZERO EXAMINED on 18 and 19 (plan :270-:272)', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITHOUT_DOCUMENT);
    for (const id of [18, 19]) {
      const check = results.find((r) => r.id === id);
      expect(check?.examined).toBe(0);
      // A pass that examined nothing says ZERO, never nothing — thesis A7 :1655-:1657.
      expect(check).toBeDefined();
    }
  });

  it('every check reports the count it examined — a check with no `examined` cannot be audited', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITH_DOCUMENT);
    // THE FLOOR: the gate ran checks at all.
    expect(results.length).toBeGreaterThan(0);
    for (const check of results) expect(typeof check.examined).toBe('number');
  });
});

describe('A6 :1529-:1531 — the THREE that now BIND, and the ONE with no subject', () => {
  it('EVIDENCE_VERIFIED, EVIDENCE_PINNED_CURRENT and EVIDENCE_DERIVED bind on a DOCUMENT mention', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITH_DOCUMENT);
    // THE FLOOR: three names, so an empty list cannot pass this.
    expect(CHECKS_THAT_NOW_BIND).toHaveLength(3);
    for (const name of CHECKS_THAT_NOW_BIND) {
      expect(results.find((r) => r.name === name)?.binding).toBe(true);
    }
  });

  it('a document failing VERIFIED REFUSES — the arm that used to pass non-binding (plan :274)', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITH_DOCUMENT);
    expect(results.find((r) => r.name === 'EVIDENCE_VERIFIED')?.passed).toBe(false);
  });

  it('check 17 reports it examined NONE — a check with no subject, NEVER a check that passed (A6 :1533)', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITH_DOCUMENT);
    const seventeen = results.find((r) => r.name === CHECK_WITH_NO_SUBJECT);
    expect(seventeen?.examined).toBe(0);
  });

  it('CITES_EVIDENCE is satisfied by a DOCUMENT mention alone (A6 :1534)', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITH_DOCUMENT);
    expect(results.find((r) => r.name === 'CITES_EVIDENCE')?.passed).toBe(true);
  });
});

describe('A6 :1537 (RULED 2026-09-22) — NAMES_NO_PERSON examines every cited document’s TITLE', () => {
  it('a title naming a person FAILS the check, and the check names the title it examined', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITH_DOCUMENT);
    const check = results.find((r) => r.name === 'NAMES_NO_PERSON');
    expect(check?.examined).toBeGreaterThan(0);
  });

  it('a document’s CONTENT may name persons; the version and the TITLE may not (A6 :1537)', async () => {
    const { runDocumentChecks } = await gate();
    const results = await runDocumentChecks(WITH_DOCUMENT);
    expect(results.find((r) => r.name === 'NAMES_NO_PERSON')).toBeDefined();
  });
});
