/**
 * What has publication opened of the documents the platform holds, by custody — and does the one witness the platform
 * did not create ever appear?
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:document-openings -- --env <env>"
 *
 * `document-openings` of docs/gf-document-flows.md A7 :1592 and §12 :1210–:1211; document plan step 34 :280. Read-only:
 * it reaches no chain, no bucket and no model, and it WRITES NOTHING — its ledger record is `runOperationalScript`'s.
 * SHED by cause, A7 :1592's third measurement, is document step 35's (plan :304).
 *
 * COUNTS ONLY: no line names a document (R86 Entry 2). EXIT 0 ALWAYS on its subject — a measurement, not a gate
 * (`extractorCoverage.ts`'s precedent); a read that fails, or counts that do not add up, throw and exit non-zero,
 * because an instrument that cannot see must never report zero.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { documentOpenings, formatDocumentOpenings } from '../src/services/documentOpeningsReport';

async function main(): Promise<void> {
  const report = await documentOpenings();
  console.log('');
  console.log(formatDocumentOpenings(report));
  console.log('');
}

void runOperationalScript(main);
