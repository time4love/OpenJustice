import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXPECTED_CHAIN_ID } from '../src/lib/chainIdentity';
import {
  formulaFor,
  ORPHANED_BY_REGISTRY,
  type LedgerKind,
  type RegistryLedger,
} from '../src/services/registryLedger';

// ---------------------------------------------------------------------------
// THE COMMITTED LEDGER IS COMPLETE — evidence flows §8, the rebuild's step 2.
//
// The emitter refuses an incomplete ledger at emission; this holds the FILE,
// which is what a reader of this public repository has. The container cannot
// commit, so the file is written on a laptop from the emitter's delimited block,
// and a transcription is where a line goes missing. Every ledger under
// registry-ledger/ is checked: the filename names the chain and the address the
// file claims; the entries are exactly 0..totalEvidence()-1; every kind is one
// the design or the researcher ruled, never UNEXPLAINED or AMBIGUOUS; the
// ORPHANED indexes are exactly the committed list for that registry, and
// PRE_WIPE appears only on the testnet before the wipe; every entry says what
// produced it, what it attested and what replaces it.
//
// OBSERVED RED FIRST, 2026-09-06: with registry-ledger/ absent, the vacuity case
// failed; with the staging ledger written from the run's block, every case
// passed. The researcher's ruling this holds is recorded verbatim in
// docs/gf-rebuild-staging-measure-2026-09-06.md §2.
// ---------------------------------------------------------------------------

const LEDGER_DIR = join(__dirname, '..', 'registry-ledger');
const FILENAME = /^(\d+)-(0x[0-9a-f]{40})\.json$/;
const KINDS: readonly LedgerKind[] = [
  'DOCUMENT_HASH',
  'CONTENT_HASH',
  'EVIDENCE_FILE_HASH',
  'EVIDENCE_PREVIOUS_FILE_HASH',
  'PRE_WIPE',
  'ORPHANED',
];
const STAGING_WIPE = Date.UTC(2026, 7, 21);

function ledgers(): { file: string; ledger: RegistryLedger }[] {
  if (!existsSync(LEDGER_DIR)) return [];
  return readdirSync(LEDGER_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((file) => ({
      file,
      ledger: JSON.parse(readFileSync(join(LEDGER_DIR, file), 'utf8')) as RegistryLedger,
    }));
}

describe('every committed registry ledger', () => {
  const all = ledgers();

  it('exists at all — an empty directory would make every case below vacuous', () => {
    expect(all.length).toBeGreaterThan(0);
  });

  it.each(all.map((l) => [l.file, l.ledger] as const))(
    '%s is named by the chain and address it claims',
    (file, ledger) => {
      const m = FILENAME.exec(file);
      expect(m).not.toBeNull();
      expect(Number(m?.[1])).toBe(ledger.chainId);
      expect(m?.[2]).toBe(ledger.registry);
      expect(ledger.registry).toBe(ledger.registry.toLowerCase());
      expect(ledger.testnet).toBe(ledger.chainId !== EXPECTED_CHAIN_ID.production);
    },
  );

  it.each(all.map((l) => [l.file, l.ledger] as const))(
    '%s holds exactly one entry per index below totalEvidence()',
    (_file, ledger) => {
      expect(ledger.totalEvidence).toBeGreaterThan(0);
      expect(ledger.entries.map((e) => e.index)).toEqual([...Array(ledger.totalEvidence).keys()]);
      expect(new Set(ledger.entries.map((e) => e.hash)).size).toBe(ledger.totalEvidence);
    },
  );

  it.each(all.map((l) => [l.file, l.ledger] as const))(
    '%s explains every entry by a ruled kind, with formula, attested and replacedBy',
    (_file, ledger) => {
      for (const e of ledger.entries) {
        expect(KINDS).toContain(e.kind);
        expect(e.hash).toMatch(/^0x[0-9a-f]{64}$/);
        expect(e.blockTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(e.formula.length).toBeGreaterThan(0);
        expect(e.attested.length).toBeGreaterThan(0);
        expect(e.replacedBy.length).toBeGreaterThan(0);
        if (e.kind === 'PRE_WIPE' || e.kind === 'ORPHANED') expect(e.inputs).toEqual([]);
        else expect(e.inputs.length).toBeGreaterThan(0);
      }
    },
  );

  it.each(all.map((l) => [l.file, l.ledger] as const))(
    '%s: the ORPHANED indexes are exactly the committed list for that registry',
    (_file, ledger) => {
      const orphaned = ledger.entries.filter((e) => e.kind === 'ORPHANED').map((e) => e.index);
      expect(orphaned).toEqual([...(ORPHANED_BY_REGISTRY[ledger.registry] ?? [])]);
    },
  );

  it.each(all.map((l) => [l.file, l.ledger] as const))(
    '%s: PRE_WIPE only on the testnet, and only before 2026-08-21',
    (_file, ledger) => {
      for (const e of ledger.entries.filter((x) => x.kind === 'PRE_WIPE')) {
        expect(ledger.chainId).toBe(EXPECTED_CHAIN_ID.staging);
        expect(new Date(e.blockTime).getTime()).toBeLessThan(STAGING_WIPE);
      }
    },
  );

  it.each(all.map((l) => [l.file, l.ledger] as const))(
    "%s: every entry's formula is the code's formula for its kind — the file was emitted by this code, not by an earlier one",
    (_file, ledger) => {
      // Reviewer finding 5, 2026-09-06: a ledger landed whose DOCUMENT formula
      // named three writers after the code had been corrected to name five. A
      // committed file that disagrees with the constant is stale, and stale reads
      // as complete unless something compares the two.
      const stale = ledger.entries
        .filter((e) => e.formula !== formulaFor(e.kind, e.inputs))
        .map((e) => `index ${String(e.index)} (${e.kind})`);
      expect(stale).toEqual([]);
    },
  );

  it.each(all.map((l) => [l.file, l.ledger] as const))(
    '%s names its registrar, its read time and the commit that emitted it',
    (_file, ledger) => {
      expect(ledger.registrar).toMatch(/^0x[0-9a-f]{40}$/);
      expect(ledger.readAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(ledger.commit).toMatch(/^[0-9a-f]{40}$/);
      // Filled by step 4 in its own commit; until then null, never a guess.
      expect(ledger.successor === null || typeof ledger.successor === 'string').toBe(true);
    },
  );
});
