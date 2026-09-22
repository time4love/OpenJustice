'use client';

import { useTranslations } from 'next-intl';
import type { ModelVoice as Voice } from '@/types/research';

// ---------------------------------------------------------------------------
// THE MODEL'S VOICE IN A TURN — docs/gf-ui-flows.md §10 :381–:384, §11 :431 ("the model's inside rule 3's
// labelled container with its model and prompt version"); docs/gf-thesis-flows.md A2 :1317 (who spent the
// call); A4 :1476's `M = { model, promptVersion, spentBy }`. Drawn on approved board ג3, the `ai` block.
//
// COMPLIANCE RULE 3'S WORDS HAVE EXACTLY ONE SPELLING, AND IT IS THE CATALOGUE KEY `opinion.label` — CALLED
// here, never re-typed. That is the property §10 :384 protects: the LABEL is one string, in one place, and a
// second literal of it is what would make the rule two rules.
//
// WHY THIS IS NOT `components/opinion/LabelledOpinion.tsx`, DECLARED RATHER THAN DONE QUIETLY. That component
// OWNS ITS BODY by deliberate design — its own :16–:20 says so in terms ("IT OWNS THE SIGNIFICANCE RATHER THAN
// TAKING IT AS CHILDREN") — and it carries ONE `classifierVersion`, where a turn's model voice carries TWO
// names (`model` and `promptVersion`) and a THIRD fact, who paid. Its instrument also asserts, at
// `test/labelledOpinion.test.tsx` :119, that the container "IS REACHED BY THE CORPUS SURFACE AND BY NOTHING
// ELSE" — so calling it from here would redden that case, correctly. The plan's :741 names "the labelled
// container (UI-7)" for these fields; the ROWS of that container cannot hold them, which is the gap this file
// fills and the question the report escalates. What is NOT duplicated is the only thing that must not be: the
// label's words.
//
// A MODEL THAT RECORDED NEITHER NAME IS SAID, NEVER SMOOTHED — `research.model.unrecorded`, which run B's real
// debate assessments need (A4 :1476 names `respondInDebate.ts` :65–:73 as the A2 :1317 debt, "said and not
// hidden"). Board ג3 draws exactly that on the publication assessment.
// ---------------------------------------------------------------------------

export function ModelVoice({ voice }: { voice: Voice }) {
  const t = useTranslations('opinion');
  const research = useTranslations('research');
  const named = voice.model !== null || voice.promptVersion !== null;
  return (
    <span data-model-voice className="flex flex-wrap items-baseline gap-2 text-xs text-ink-muted">
      {/* RULE 3'S LABEL, CALLED. */}
      <span data-opinion-label>{t('label')}</span>
      {named ? (
        <>
          {voice.model === null ? null : (
            // BIDI-ISOLATED: Latin inside a Hebrew line, and a NAME rather than an id — the distinction
            // §4 :168 draws and `LabelledOpinion` :34–:37 records.
            <bdi data-model-name dir="ltr">
              {voice.model}
            </bdi>
          )}
          {voice.promptVersion === null ? null : (
            <bdi data-prompt-version dir="ltr">
              {voice.promptVersion}
            </bdi>
          )}
        </>
      ) : (
        <span data-model-unrecorded>{research('model.unrecorded')}</span>
      )}
      <span data-spent-by>{research('analysis.spentBy', { handle: voice.spentBy.handle })}</span>
    </span>
  );
}
