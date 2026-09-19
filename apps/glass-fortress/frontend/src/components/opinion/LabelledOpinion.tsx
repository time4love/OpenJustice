import { useTranslations } from 'next-intl';
import type { ClassifierOpinion } from '@/types/corpus';

/**
 * THE THIRD VOICE — docs/gf-ui-flows.md §10 :381–:384; docs/gf-ui-refactor-plan.md UI-7 :592–:596.
 *
 * THE MODEL'S VOICE IS ALWAYS INSIDE A CONTAINER THAT CARRIES RULE 3'S LABEL, "ניתוח AI — אינו מהווה קביעה
 * שיפוטית" (COMPLIANCE.md :68), with the version beside it — "Never outside one" (§10 :384). This is that
 * container, and it is ONE: the classifier's opinion on a diff is the only model voice on any public page
 * (§24 :690–:692; evidence A4 :1086), and UI-8's read view renders its own model fields through this same
 * component rather than a second one.
 *
 * IT OWNS THE SIGNIFICANCE RATHER THAN TAKING IT AS CHILDREN, deliberately. A container that accepted
 * arbitrary children would let a caller render `significance` beside it instead of inside it, and the rule
 * §10 states is about WHERE the model's words are, not about what wraps them. The remaining fields —
 * categories, editorial, draws — are the record sheet's (§26) and arrive here when that lands, inside this
 * element, never outside it.
 *
 * CLAMPED TO TWO LINES, NOT A CHIP (§24 :663–:669, the researcher's amendment of 2026-09-18). The measurement
 * that ruled it: a real `significance` runs 197 characters, and a chip at 375 px shows about forty — cutting
 * the conclusion. THE CLAMP IS VISUAL ONLY: the whole string is in the DOM, because the reveal that chunk 5
 * adds must have something to reveal, and a clamp that truncated the markup would make that control a promise
 * the element could not keep.
 *
 * NO REVEAL CONTROL HERE, AND ITS ABSENCE IS A RULING RATHER THAN AN OMISSION. §24 gives the control the word
 * „עוד", which is not approved copy — and copy lands approved or not at all. It arrives with the stream, in
 * the chunk that first renders an opinion to a reader; until then this element has no consumer at all, which
 * is why drawing a control now would be a control that leads nowhere on a page nobody can reach.
 *
 * THE VERSION IS BIDI-ISOLATED because it is Latin inside a Hebrew line, and it is NOT an id: §4 :168 bars a
 * hash, a cuid and a 14-digit timestamp from being read aloud, while §10 :383 positively requires the version
 * beside the label. `v5-editorial-verdict` is a name a reader can check, which is the distinction that rule
 * draws.
 */
export function LabelledOpinion({ opinion }: { opinion: ClassifierOpinion }) {
  const t = useTranslations('opinion');
  return (
    <section data-labelled-opinion className="rounded border border-line bg-surface p-3">
      <p data-opinion-label className="flex flex-wrap items-baseline gap-2 text-xs text-ink-muted">
        {t('label')}
        <bdi data-opinion-version dir="ltr">
          {opinion.classifierVersion}
        </bdi>
      </p>
      <p data-opinion-body dir="auto" className="line-clamp-2 text-sm text-ink">
        {opinion.significance}
      </p>
    </section>
  );
}
