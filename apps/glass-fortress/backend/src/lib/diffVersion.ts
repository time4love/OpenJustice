import { CLASSIFIER_VERSION } from './classifierVersion';
import { DIFF_INPUT_VERSION } from './diffChunking';

/**
 * THE KEY OF A DIFF'S CONTENT VERSION — the differ and the classifier, named
 * together (docs/gf-evidence-flows.md §3, A2).
 *
 * A content version records what produced it as provenance, and this is that
 * provenance's one spelling: `DIFF_INPUT_VERSION` says how the chunks were cut,
 * `CLASSIFIER_VERSION` which question the model was asked over them. Either
 * moving is a new derivation of every diff — and the design says that out loud
 * (§3: "every CITED DIFF enters review — the price of a better differ, paid by a
 * human once per record") — so the two are composed here rather than compared
 * separately, and CURRENT(diff) asks one equality, never two.
 *
 * Composed, not declared: a constant typed by hand beside the two it names is
 * the copy that drifts. `SUMMARY_VERSION` is not a part — the summary is
 * opinion, recorded inside the classification with its own version, and never
 * moves a content version (A1: no opinion in the hash, no version label in it).
 */
export const DIFF_VERSION = `${DIFF_INPUT_VERSION}+${CLASSIFIER_VERSION}`;
