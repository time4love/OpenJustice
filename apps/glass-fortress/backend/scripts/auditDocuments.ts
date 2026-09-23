/**
 * `document-recomputable` — every HELD document's bytes hash to its name; every SEALED one carries its receipt
 * stamp; every Evidence of kind DOCUMENT names its document's commitment. Lists, never repairs.
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:audit-documents -- --env <env>"
 *
 * docs/gf-document-flows.md A7 :1549–:1552; plan :146–:149, :188. Exit 0 all pass · exit 1 malformed rows, listed.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { auditDocuments, exitCodeForAudit, formatDocumentAudit } from '../src/services/auditDocuments';

async function main(): Promise<number> {
  const report = await auditDocuments();
  console.log('');
  console.log(formatDocumentAudit(report));
  console.log('');
  return exitCodeForAudit(report);
}

void runOperationalScript(main);
