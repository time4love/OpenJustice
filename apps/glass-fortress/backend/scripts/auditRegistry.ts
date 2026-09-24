/**
 * `anchors-explainable` — every entry on the LIVE registry explained, or exit 1 naming each unexplained index.
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:audit-registry -- --env <env>"
 *
 * docs/gf-evidence-flows.md A7 :1268–:1273, extended by docs/gf-document-flows.md A7 :1554–:1556 (document step 31).
 * READ-ONLY: RPC reads and database reads; no transaction, no write, no spend.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { auditRegistry, exitCodeForRegistryAudit, formatRegistryAudit } from '../src/services/auditRegistry';
import { loadCorpusHashes, readRegistryState } from '../src/services/registryState';
import { Web3Service } from '../src/services/Web3Service';

async function main(): Promise<number> {
  const web3 = new Web3Service();
  const [state, corpus] = await Promise.all([readRegistryState(web3), loadCorpusHashes()]);
  console.log(`registry     ${state.registryAddress}`);
  console.log(`read at      ${state.readAt}\n`);
  const audit = auditRegistry(state, corpus);
  console.log(formatRegistryAudit(audit));
  console.log('');
  return exitCodeForRegistryAudit(audit);
}

void runOperationalScript(main);
