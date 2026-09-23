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
 * THE BUCKET READER IS `documentBucket`'s `readObject` (document step 30): the bytes under the document's key,
 * or NULL when no object is stored there — the service's `ReadObject` contract, which reports the absence rather
 * than a sweep it could not perform.
 */
import 'dotenv/config';
import { runOperationalScript } from '../src/lib/operationalContext';
import { readObject } from '../src/services/documentBucket';
import { formatRederive, rederiveDocuments } from '../src/services/rederiveDocuments';

async function main(): Promise<void> {
  const report = await rederiveDocuments((document) => readObject(document.bytes ?? document.docId));
  console.log('');
  console.log(formatRederive(report));
  console.log('');
}

void runOperationalScript(main);
