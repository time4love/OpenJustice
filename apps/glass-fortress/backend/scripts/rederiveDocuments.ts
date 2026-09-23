/**
 * Re-derive every HELD document whose text predates the current extractor.
 *
 *   railway ssh --environment <env> --service glass-fortress-backend \
 *     "cd apps/glass-fortress/backend && npm run forensics:rederive-documents -- --env <env>"
 *
 * The derivation pass of plan step 29 :159-:161 and docs/gf-document-flows.md §3
 * :346-:348: it runs when `CURRENT_EXTRACTOR` MOVES, appends a version per HELD
 * document whose text changed, and KEEPS THE OLD.
 *
 * IT WRITES VERSIONS AND NEVER A DECISION. A promoted document whose content moves
 * enters review and a human owes the judgement — "no automatic re-affirmation,
 * ever" (evidence §6). This pass does not affirm, does not withdraw, does not
 * delete, and does not touch a SEALED document, whose plaintext existed once.
 *
 * ON DEMAND, IN THE DEPLOYMENT, like every maintenance act — never scheduled, and
 * never from a laptop. Whether it ever earns a scheduler is §12's measurement.
 *
 * THE BUCKET READER IS NOT BUILT UNTIL STEP 30, which owns the bucket, the
 * signed-URL route and the sweep. Until then this pass has nothing to read and
 * says so rather than reporting a clean sweep over nothing.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { formatRederive, rederiveDocuments } from '../src/services/rederiveDocuments';

async function main(): Promise<void> {
  const report = await rederiveDocuments(() =>
    Promise.reject(
      new Error(
        'rederive-documents: the bucket reader is document step 30’s and is not built. ' +
          'The pass refuses rather than reporting a sweep it could not perform.',
      ),
    ),
  );
  console.log('');
  console.log(formatRederive(report));
  console.log('');
}

void runOperationalScript(main);
