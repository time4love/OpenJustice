/**
 * How much of what the platform holds has COMPUTED text, and how much is its bytes?
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:extractor-coverage -- --env <env>"
 *
 * `extractor-coverage` of docs/gf-document-flows.md A7 :1591 and §12 :1207. Read-only:
 * it reaches no chain, no archive and no model, and it WRITES NOTHING.
 *
 * It reports TWO subjects because the design asks it two questions. The FIXTURE SET
 * — the four kinds of plan :157 as amended 2026-09-23 — is what judges the extractor
 * DEPENDENCY, and it exists from document step 29. The CORPUS is §12's measurement
 * and fills from step 30; at step 29 it is zero, which is an observation and is
 * printed as one.
 *
 * EXIT 0 ALWAYS on its own subject. Coverage is a measurement and not a gate: a
 * document whose content is its bytes is BYTES-ONLY, "counted as bytes-only, never
 * as a failure" (plan :169-:170). It exits non-zero only when it could not LOOK —
 * an unreadable fixture set throws, because an instrument that cannot see must
 * never report zero.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { extractorCoverage, formatCoverage } from '../src/services/extractorCoverage';

async function main(): Promise<void> {
  const report = await extractorCoverage();
  console.log('');
  console.log(formatCoverage(report));
  console.log('');
}

void runOperationalScript(main);
