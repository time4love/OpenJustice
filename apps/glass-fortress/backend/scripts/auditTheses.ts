/**
 * Does every published citation stand?
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:audit-theses -- --env <env>"
 *
 * `thesis-cites-verified` of docs/gf-evidence-flows.md A7 and docs/gf-thesis-flows.md
 * A7, its EVIDENCE half. Read-only: no chain call of its own, no model, no write.
 *
 * Exit 0 when every published citation is PUBLISHABLE and unflagged, INCLUDING
 * when nothing is published — "a pass that examined nothing says zero, never
 * nothing" (thesis A7), so the two counts are the report's first lines. Exit 2
 * lists flagged citations, an expected state. Exit 1: a published citation fails
 * a conjunct no flag covers — the gate did not hold — or cannot be graded at all.
 *
 * Its ledger command is thesis step 24's, where the instrument first has a subject.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { auditTheses, exitCodeFor, formatThesisAudit } from '../src/services/auditTheses';

async function main(): Promise<number> {
  const report = await auditTheses();
  console.log('');
  console.log(formatThesisAudit(report));
  console.log('');
  return exitCodeFor(report);
}

void runOperationalScript(main);
