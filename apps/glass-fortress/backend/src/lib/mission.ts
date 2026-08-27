import { createHash } from 'crypto';
import { SCAN_RELEVANCE_CHECK_PROMPT } from '../prompts/scanRelevanceCheck';

/**
 * THE ADMISSION CRITERION — a specification, not the home page's copy.
 *
 * DELIBERATELY SEPARATE FROM THE PUBLIC MISSION STATEMENT, after trying the
 * opposite. Interpolating the home page's hero text into the prompt looked like
 * "one rule, one implementation", and it is the wrong reading of that rule.
 *
 * The two artefacts have different jobs, like a law and its regulations. The home
 * page states a purpose for readers, and is edited for tone, length and rhythm.
 * This states what may enter the corpus, and needs enumeration and edge cases.
 * Forcing one string to do both makes each worse — and produces a concrete
 * absurdity: because a verdict stores the hash of what it was judged against,
 * A MARKETING TWEAK TO A HEADLINE WOULD MARK EVERY STORED VERDICT AS REACHED
 * UNDER DIFFERENT WORDS and re-open the corpus for re-assessment.
 *
 * The defect that actually needed fixing was never that the criterion differed
 * from the hero copy. It was that the criterion had NO VERSION, NO HASH AND NO
 * RECORD — so nobody could say which rule a rejection was made under, or notice
 * when it changed. That is what the constants below fix.
 */

/**
 * SHA-256 of the criterion a verdict was reached under — the prompt itself.
 *
 * §3's `sourceStateHash` discipline: change the criterion and every prior verdict
 * is visibly judged under different words, which makes "re-assess everything
 * rejected under the old rule" a query rather than an archaeology exercise.
 *
 * Taken over the PROMPT ITSELF, because the prompt IS the criterion here — there
 * is no separate policy document it paraphrases. A hash of something the prompt
 * merely quoted would move independently of the rule actually applied.
 */
export const SCAN_RELEVANCE_PROMPT_HASH = createHash('sha256')
  .update(SCAN_RELEVANCE_CHECK_PROMPT, 'utf8')
  .digest('hex');

/**
 * Names the procedure, where MISSION_HASH proves the text.
 *
 * Pinned to its literal in a test, because asserting a constant against itself is
 * a tautology — the shape that let a blanked TEXT_EXTRACTION_VERSION survive its
 * own mutation.
 */
export const SCAN_RELEVANCE_VERSION = 'v1-recorded-verdicts';
