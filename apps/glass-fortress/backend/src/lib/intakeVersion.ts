import { createHash } from 'crypto';
import { INTAKE_CLASSIFICATION_PROMPT } from '../prompts/intakeAgentClassification';

// ---------------------------------------------------------------------------
// Provenance for an evidence record's CLASSIFICATION.
//
// evidenceTier, evidenceRole, investigativeCategories, keyFigures, summary and
// evidenceDate are LLM output written to columns and never recomputed on read.
// The moment the prompt changes they mean different things on different rows,
// and nothing can tell which rubric judged which row.
//
// That is not hypothetical. On 2026-08-25 the tier rubric changed from grading
// by FORM ("media article -> Tier 3") to grading by CONTENTS, and the keyFigures
// rule changed from a principle to an explicit exclusion list. The same article,
// classified either side of that change, produced Tier 3 with four figures and
// Tier 1 with two. Both rows would have looked equally authoritative.
//
// This mirrors UrlVersionDiff's classifierVersion + classifierPromptHash exactly,
// and deliberately so: the forensic path solved this in August and the intake
// path never got it — the rule applied where it was discovered rather than
// everywhere it was true.
//
// Two values, two jobs:
//
//   INTAKE_VERSION is human-readable, and is what a future reclassification
//   would target ("bring everything below v2 up to date").
//
//   intakePromptHash is the proof. A version string is a promise; edit the
//   prompt without bumping it and every row claims a version that no longer
//   describes what judged it. The hash is checkable against git.
//
// The prompt text is NOT stored per row. It lives in git, versioned and
// diffable, and the hash recovers it exactly.
// ---------------------------------------------------------------------------

/**
 * Bump on any change that alters what the intake classifier would decide.
 *
 * v2-contains-not-form: tier is graded by what a document CONTAINS rather than
 * by its publication form, and keyFigures defaults to exclusion with the
 * excluded classes named.
 *
 * The previous rubric's branch 3 read "media article or general pattern without
 * direct proof", so "media article" stood alone as a form test. Measured on one
 * article the same day: shown a truncated extraction the model returned Tier 1;
 * shown the full page it returned Tier 3, reasoning that this is a journalistic
 * investigation — more information moved the answer FURTHER from the truth,
 * because the byline made the container obvious while the rubric asked about the
 * container. Its own reasoning called the direct quotes high evidentiary weight
 * and then filed the document under Supporting.
 *
 * keyFigures previously said only "do not include figures merely referenced for
 * context", and the model still listed a pharmaceutical CEO who appears as
 * background, and the whistleblower whose warning the document reports. That
 * list feeds a per-person dossier.
 *
 * v1-form-graded: everything created before that change. Not a version any row
 * carries — rows from that era have no stamp at all, which is the honest state
 * and reads as "unknown", never as "current".
 */
export const INTAKE_VERSION = 'v2-contains-not-form';

/**
 * SHA-256 of the system prompt actually sent to the model.
 *
 * `INTAKE_CLASSIFICATION_PROMPT` is passed verbatim as the system message by
 * every IntakeAgent entry point, so hashing the constant hashes exactly what
 * judged the record.
 */
export function intakePromptHash(): string {
  return createHash('sha256').update(INTAKE_CLASSIFICATION_PROMPT, 'utf8').digest('hex');
}
