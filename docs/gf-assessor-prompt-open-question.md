# The diff-debate assessor prompt — an unlanded change

**Status: written, untested, deliberately not landed.** Branch
`fix/gf-assessor-platform-context`. Nothing on staging or production runs it.

This document exists because the change is worth less than the reasoning around it, and
because part of that reasoning turned out to be wrong in a way the next person would
otherwise inherit.

## What the change does

Adds three things to `src/prompts/forensicPromotionAssessment.ts`:

1. **A model of the platform.** The assessor is currently told what to judge but not what it
   is judging *for*. It has no idea that the evidence bank is one stage of three, that
   `DevilsAdvocateAgent` rates thesis strength separately, or that unresolved gaps become
   whistleblower requests and FOIA letters.
2. **A sharper merit criterion.** `SUPPORTS` becomes *"does this change bear on an
   investigative concern such that a thesis could cite it and be tested"* rather than the
   vaguer *"מבסס נגיעה לעילות החקירה"*, which the assessor was reading as *"establishes the
   allegation"*.
3. **An objection even on `SUPPORTS`.** The objection stops being a refusal and becomes a
   contribution: what would weaken the claim, and what would be needed to strengthen it,
   preserved beside the evidence for the thesis stage.

## Why it was written — and why that reason is now partly obsolete

It was written after the assessor dismissed a researcher's argument as *"טיעון מתודולוגי
כללי"* and demanded *"קשירה עובדתית ומשפטית בין הטקסט שהשתנה לבין עילת חקירה קונקרטית"* —
a proof standard, applied at an intake stage.

Two things have changed since:

- **The multi-round bugs were fixed** (PRs #97, #98). The mis-scoped substance gate is gone.
  Asked again with full history, the assessor granted substance on the cumulative argument,
  returned a real objection, and explicitly stated the researcher may promote over it. It is
  mis-calibrated, not broken.
- **The architectural argument is already implemented in code.** Promotion over objection is
  permitted, so the assessor disagreeing blocks nothing. Persuading it was never load-bearing.

## The sharper case, which does still hold

**A verdict that is always `DISPUTES` conveys nothing.**

By construction nothing is *proven* at admission stage — the corroborating evidence is
precisely what admission lets a researcher go looking for. So if the assessor applies a proof
standard, it can never return `SUPPORTS`, every hand-promoted diff carries
`promotedOverObjection: true`, and a flag that is always set tells a reader nothing. The
dissent signal degrades into noise, which is a real loss: its whole purpose is to mark the
minority of promotions a human should look at twice.

## The control design — and the one that was invalid

Editing a judge's instructions to make it agree with you is indistinguishable from fixing a
mis-calibrated judge, unless the change is validated in **both** directions.

**Downward** — a good-faith but genuinely weak argument on a routine diff. For example, that
a mall vaccination-site announcement evidences coercion. The form is fine, so substance
should pass; the merits should still return `DISPUTES`. If it returns `SUPPORTS`, the bar
dropped rather than moved, and the change must be reverted.

**Upward** — the argument made about diff `2022-09-21 → 2022-11-29` on 2026-08-22 (session
`cmt4antzt0001ljwjd6kpkzye`) should return `SUPPORTS`. It bears on an investigative concern
while remaining unproven, which is exactly the case the current prompt cannot express. If it
still returns `DISPUTES`, the change did not work.

### FINDING — the original control was invalid

Diff `2025-04-25 → 2025-06-01` (#76) was proposed as the downward control, on the belief that
it was a *future → present tense change* the earlier classifier had wrongly flagged.

That was wrong. Reading the items rather than the classifier's summary shows the page moved
from **צפוי לתת הגנה רחבה יותר** ("is expected to give broader protection") to **נותן הגנה
רחבה יותר** ("gives broader protection") — a hedged prediction converted into an asserted
fact, with no new evidence cited. The adjacent hedge (*"וייתכן שלמשך זמן ארוך יותר"*) was
left in place, which makes it harder to read as incidental copy-editing.

Item-level classification later flagged it `SAFETY_CLAIM_ALTERATION`,
`WITHHOLDING_INFORMATION`, `ACCOUNTABILITY_EROSION`.

So the case chosen to prove the assessor does not over-approve was a **true positive**, and
the test as designed never existed. The error is instructive: the aggregate summary called it
*"עדכון תפעולי ולשוני שגרתי"*, which is true of the tense shift and silent about the dropped
hedge — and that summary was repeated without reading the underlying items. That is the same
bias item-level classification was built to remove, committed while assessing its output.

**Do not reuse #76 as a control.** Pick a diff with genuinely routine content and argue for it
in good faith but weakly.

## Recommendation

Land it only alongside both controls, run against a real debate. Until then it stays here:
the component it modifies gates what enters the evidence corpus, and shipping an untested
change into that path is the failure mode this project has hit repeatedly.
