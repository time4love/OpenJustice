/**
 * Read the evidence registry from STATE and attribute the corpus against it.
 *
 *   npm run forensics:read-registry -- --env staging
 *
 * The rebuild's step 1(b) (evidence flows §8; refactor plan §3 step 9). For
 * every index below totalEvidence(): the hash, the submitter, the block time and
 * the category, read from the contract's storage — never from a receipt or a
 * log. Then every hash column of every corpus row asked of the registry, and
 * each entry classified by which column produced it.
 *
 * READ-ONLY. RPC reads and database reads; no transaction, no write, no spend.
 *
 * This is a MEASUREMENT, not a gate: an UNEXPLAINED entry is printed and the
 * run exits 0, because the number is what the dated doc records. The refusal
 * on an unexplained entry belongs to step 2's ledger emitter, which reads the
 * same state through the same module. The one refusal here is the read's own —
 * a partial or moving read throws, and nothing is printed for it.
 *
 * A JSON block between the two delimiters carries every row, so counts are
 * taken from the file with jq and never transcribed by hand.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { readRegistryAttribution } from '../src/services/registryState';

async function main(): Promise<void> {
  const report = await readRegistryAttribution();
  const s = report.state;

  console.log(`registry     ${s.registryAddress}`);
  console.log(`registrar    ${s.registrarAddress}`);
  console.log(`read at      ${s.readAt}`);
  console.log(`totalEvidence()  ${String(s.totalEvidence)}  (re-read after every index, unchanged)\n`);

  console.log('entries by kind');
  for (const [kind, n] of Object.entries(report.byKind)) {
    console.log(`  ${kind.padEnd(28)} ${String(n)}`);
  }
  console.log('\nsnapshots, per subject');
  for (const [k, n] of Object.entries(report.bySubject.snapshots)) {
    console.log(`  ${k.padEnd(28)} ${String(n)}`);
  }
  console.log('evidence rows, per subject');
  for (const [k, n] of Object.entries(report.bySubject.evidence)) {
    console.log(`  ${k.padEnd(28)} ${String(n)}`);
  }
  console.log('\ncorpus hashes by verdict  (per column asked — a legacy row is registered on ONE of its two)');
  for (const [verdict, n] of Object.entries(report.byVerdict)) {
    console.log(`  ${verdict.padEnd(28)} ${String(n)}`);
  }

  console.log('\nindex  block time            submitter                                   kind                         category');
  for (const e of report.entries) {
    console.log(
      `${String(e.index).padStart(5)}  ${new Date(e.timestamp * 1000).toISOString()}  ${e.submitter}  ` +
        `${e.classification.kind.padEnd(28)} ${e.category}`,
    );
  }

  const unexplained = report.entries.filter((e) => e.classification.kind === 'UNEXPLAINED');
  if (unexplained.length > 0) {
    console.log(
      `\n${String(unexplained.length)} entr${unexplained.length === 1 ? 'y' : 'ies'} match no hash column ` +
        'in this database. Recorded here; step 2 refuses to emit a ledger while any remains.',
    );
  }

  console.log('\n--- JSON ---');
  console.log(JSON.stringify(report));
  console.log('--- END JSON ---');
}

void runOperationalScript(main);
