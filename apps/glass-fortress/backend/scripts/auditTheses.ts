/**
 * Does every published citation stand?
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:audit-theses -- --env <env>"
 *
 * `thesis-cites-verified` of docs/gf-evidence-flows.md A7 and docs/gf-thesis-flows.md
 * A7 :1621–:1628, whole since thesis step 24: for every published version, the six
 * evidence predicates per EVIDENCE citation, TRAJECTORY_CURRENT per trajectory,
 * CLAIM_FRAMED, and FLAGGED per citation. Read-only: no chain call of its own, no
 * model, no write.
 *
 * Exit 0 when every published version is publishable and unflagged, INCLUDING
 * when nothing is published — "a pass that examined nothing says zero, never
 * nothing" (thesis A7), so the three counts are the report's first lines. Exit 2
 * lists flagged citations and stale trajectories, an expected state. Exit 1: a
 * conjunct no flag covers — an evidence failure, a trajectory no stored pass holds,
 * a claim no framing chose — the gate did not hold. A malformed load THROWS, and
 * `runOperationalScript` exits 1 on it.
 *
 * Its ledger command is `npm run forensics:audit-theses -- --env <env>` (thesis
 * refactor plan §6: the entry gains its command at step 24).
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
