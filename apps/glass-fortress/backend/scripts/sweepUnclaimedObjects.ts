/**
 * The sweep of unclaimed objects — bucket objects no Document names, older than the lifetime (7 days).
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:sweep-unclaimed-objects -- --env <env>"
 *
 * LISTS BY DEFAULT. With `--delete` it removes each due object only after re-reading, at that moment, that no
 * Document names it. It never touches a row. docs/gf-document-flows.md §9 :998; R76 chunk-1 sketch §(c).
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { formatSweep, sweepUnclaimedObjects } from '../src/services/sweepUnclaimedObjects';

async function main(): Promise<number> {
  const removing = process.argv.includes('--delete');
  const report = await sweepUnclaimedObjects({ remove: removing, now: new Date() });
  console.log('');
  console.log(formatSweep(report, removing));
  console.log('');
  return 0;
}

void runOperationalScript(main);
