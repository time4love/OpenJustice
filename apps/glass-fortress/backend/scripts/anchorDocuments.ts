/**
 * THE STANDING PASS — anchors every document owed beyond the 10-minute floor, then reads chain state after.
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:anchor-documents -- --env <env>"
 *
 * docs/gf-document-refactor-plan.md :198–:204. A MAINTENANCE act that WRITES TO A CHAIN: run ON DEMAND, in the
 * container, on the researcher's word — never on MCP, never from a laptop (the deployment guard refuses the write
 * there). Exit 0 nothing owed after · exit 2 still owed (an outage stopped it) · exit 1 a defect (FOREIGN_SUBMITTER in
 * the input — nothing written — or any other failure).
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { readStanding } from '../src/services/anchorDocuments';
import { openDocumentRegistryWindow } from '../src/services/anchorSnapshots';
import { formatAnchorPass, runAnchorPass } from '../src/services/documentAnchorPass';

async function main(): Promise<number> {
  const window = openDocumentRegistryWindow();
  const result = await runAnchorPass(window, (document) => readStanding(window, document), () => new Date());
  console.log('');
  console.log(formatAnchorPass(result));
  console.log('');
  return result.exit;
}

void runOperationalScript(main);
