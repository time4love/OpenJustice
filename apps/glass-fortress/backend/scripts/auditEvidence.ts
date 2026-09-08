/**
 * Is every evidence row the record it claims to be?
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:audit-evidence -- --env <env>"
 *
 * `evidence-recomputable` of docs/gf-evidence-flows.md A7. Read-only: it needs no
 * chain, no archive and no model, and it REPAIRS NOTHING — a row that fails is
 * malformed, not stale, and rewriting its hash would make a wrong row look right.
 *
 * Exit 0 when every row names the record it is keyed to, INCLUDING when there are
 * no rows: "is any stored row malformed?" has a true answer at zero, and the
 * count is the report's first line so the answer is never mistaken for a check
 * that was skipped. Exit 1 lists the malformed rows and what each claims.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { auditEvidence, formatEvidenceAudit } from '../src/services/auditEvidence';

async function main(): Promise<void> {
  const report = await auditEvidence();
  console.log('');
  console.log(formatEvidenceAudit(report));
  console.log('');
  if (report.malformed.length > 0) process.exit(1);
}

void runOperationalScript(main);
