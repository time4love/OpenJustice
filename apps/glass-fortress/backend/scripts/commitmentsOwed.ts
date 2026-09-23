/**
 * `commitments-owed` — the documents whose commitment the registry does not attribute to our registrar, with their
 * age: the standing pass's input (step 31 builds the pass that pays them).
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:commitments-owed -- --env <env>"
 *
 * docs/gf-document-flows.md A7 :1558–:1560; plan :188–:189. Exit 0 none owed · exit 2 owed, listed — an EXPECTED
 * state, never a failure. READ-ONLY on the chain: `attributeClaim` asks the registry and writes nothing.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { commitmentsOwed, exitCodeForOwed, formatCommitmentsOwed } from '../src/services/commitmentsOwed';
import { attributeClaim, entryFromChain } from '../src/services/registryState';
import { Web3Service } from '../src/services/Web3Service';

async function main(): Promise<number> {
  const web3 = new Web3Service();
  const entryAt = entryFromChain(web3);
  const report = await commitmentsOwed(async (commitment) => (await attributeClaim(web3, entryAt, commitment)).verdict, new Date());
  console.log('');
  console.log(formatCommitmentsOwed(report));
  console.log('');
  return exitCodeForOwed(report);
}

void runOperationalScript(main);
