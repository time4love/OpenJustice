/**
 * Emit the REGISTRY LEDGER for the registry this deployment is configured with.
 *
 *   npm run forensics:registry-ledger -- --env staging
 *
 * The rebuild's step 2 (evidence flows §8; refactor plan §3 step 9). Every index
 * on the registry read from STATE, each explained by the corpus column that
 * produced its hash or by the researcher's ruled kinds, verified complete against
 * totalEvidence(), and printed as JSON between the two delimiters below. The
 * container cannot commit, so the file under registry-ledger/ is written from
 * exactly that block by whoever ran this, and a test holds it complete.
 *
 * READ-ONLY. RPC reads and database reads; no transaction, no write, no spend.
 *
 * REFUSES — exit 2, no JSON — when the entry count is not totalEvidence(), when
 * any index matches no hash column and is not on the ORPHANED list for this
 * registry (or, on the testnet, is not before the 2026-08-21 wipe), when an
 * index is AMBIGUOUS, or when the registry is empty. Every offending index is
 * named. Nothing below step 2 runs while an index is unexplained.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { readChainIdentity } from '../src/lib/chainIdentity';
import { Web3Service } from '../src/services/Web3Service';
import { loadCorpusHashes, readRegistryState } from '../src/services/registryState';
import { buildRegistryLedger, LedgerRefusal } from '../src/services/registryLedger';

async function main(context: { commitSha: string | null }): Promise<number | undefined> {
  const chain = await readChainIdentity();
  if (!chain.reachable) {
    console.error(`The chain could not be read: ${chain.error}`);
    return 1;
  }

  const web3 = new Web3Service();
  const [state, corpus] = await Promise.all([readRegistryState(web3), loadCorpusHashes()]);

  let ledger;
  try {
    ledger = buildRegistryLedger({ state, corpus, chainId: chain.chainId, commit: context.commitSha });
  } catch (err) {
    if (err instanceof LedgerRefusal) {
      console.error(`\n${err.message}\n`);
      return 2;
    }
    throw err;
  }

  console.log(`registry       ${ledger.registry}`);
  console.log(`chain          ${String(ledger.chainId)}${ledger.testnet ? '  (testnet)' : ''}`);
  console.log(`registrar      ${ledger.registrar}`);
  console.log(`totalEvidence  ${String(ledger.totalEvidence)}  read at ${ledger.readAt}`);
  console.log(`commit         ${ledger.commit ?? 'unknown'}\n`);

  const byKind = new Map<string, number>();
  for (const e of ledger.entries) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  for (const [kind, n] of byKind) console.log(`  ${kind.padEnd(28)} ${String(n)}`);

  console.log('\n--- LEDGER JSON ---');
  console.log(JSON.stringify(ledger, null, 2));
  console.log('--- END LEDGER JSON ---');
  // NO EXIT CODE ON SUCCESS: a number here becomes process.exit(), and under
  // railway ssh stdout is a pipe whose queued output process.exit() discards.
  // The JSON above is the file that gets committed.
  return undefined;
}

void runOperationalScript(main);
