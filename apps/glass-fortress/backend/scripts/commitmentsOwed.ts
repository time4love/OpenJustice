/**
 * `commitments-owed` — the documents not ANCHORED (both arms, A3 :1366 as ruled 2026-09-24), beyond the 10-minute floor,
 * with their moment and age: the standing pass's input.
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:commitments-owed -- --env <env>"
 *
 * docs/gf-document-flows.md A7 :1558–:1560; plan :188–:189; relay item 8. Exit 0 none owed · exit 2 owed, listed — an
 * EXPECTED state, never a failure. READ-ONLY on the chain: `readStanding` asks the registry and writes nothing.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { readStanding } from '../src/services/anchorDocuments';
import { openDocumentRegistryWindow } from '../src/services/anchorSnapshots';
import { commitmentsOwed, exitCodeForOwed, formatCommitmentsOwed } from '../src/services/commitmentsOwed';

async function main(): Promise<number> {
  const window = openDocumentRegistryWindow();
  const report = await commitmentsOwed((document) => readStanding(window, document), new Date());
  console.log('');
  console.log(formatCommitmentsOwed(report));
  console.log('');
  return exitCodeForOwed(report);
}

void runOperationalScript(main);
