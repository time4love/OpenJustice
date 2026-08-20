# GF Public Adverse-Outcome Self-Reports — Dev Plan

**Status:** Phase 0 (schema draft) ✅ DONE — committed `4f99c9e`. **Phase 1 (migration) ✅ DONE**,
applied to staging. **Phase 2 (zod intake validation) ✅ DONE 2026-08-20** — `src/lib/reportIntakeSchemas.ts`.
**Hebrew/English category labels ✅ DONE for all domains** (§2.7) — Medical, Social/Economic, and
Report's own demographic fields, each verified against the real Prisma enum values, not eyeballed.
**Per-question bilingual help text drafted** (§4.3) — not yet wired to `messages/*.json`, deferred to
Phase 8. **GDPR-driven `Report` redesign ✅ DONE 2026-08-20 (§2.8)** — `reporterFingerprintHash`
removed entirely (was pseudonymization, not anonymization; `reporterFingerprint.ts` deleted as dead
code), `consentGiven` added (explicit special-category consent, GDPR Art. 9(2)(a)), bucketed
`reporterAgeRange`/`reporterGender` added (real pharmacovigilance value, deliberately coarse against
quasi-identifier risk). Three staging migrations applied and independently verified this session
(`...adverse_event_reports`, `...anonymize_and_consent`, `...reporter_demographics`). **Phase 3
(public intake API) ✅ DONE 2026-08-20** — `POST /api/reports/medical`/`social-economic`, the
`requireVerifiedReporterEmail` middleware (verifies + deletes the Supabase account in the same
request, fails closed on deletion error), nested-write creation, 24 new tests, full suite 706/706,
`tsc` clean. On branch `schema/gf-adverse-effect-reports` (pushed, no PR yet). Phase 4
(`ReportPlausibilityService`) is next. See §5-6 for the full phase breakdown. This document
is the canonical reference for the taxonomy's rationale; keep it in sync with `schema.prisma` as the
design evolves.
**Created:** 2026-08-20.
**Scope:** Glass Fortress only. New models: `Report`, `MedicalAdverseEventReport`,
`SocialEconomicImpactReport`, plus supporting enums.

---

## 0. Why this exists

GF's existing `Evidence` model is deliberately low-volume and individually citable — every row is
either a hashed document or a forensic diff, traceable to a checkable artifact, and a thesis cites
specific rows. There is no channel today for the opposite shape of data: high-volume, individually
unverifiable, public self-reports of adverse outcomes after vaccination — medical (new diagnoses,
symptoms) and non-medical (job loss, family estrangement, access denial). This plan designs that
channel as a **separate model**, not a new `Evidence` type, because conflating the two would blur the
exact distinction `Evidence.status` exists to protect (see
[feedback-evidentiary-proof-standard.md]) and would pollute low-volume evidentiary stats with
high-volume unverified noise.

The full brainstorm — why volume matters differently here (aggregate signal, not individual proof),
why fake-report mitigation needs a layered approach, and why the model follows Bronze Fortress's
"structured questionnaire, not free text" principle — happened in chat; this document captures only
what needs to survive into the codebase: the taxonomy, its evidentiary grounding, and the public-facing
explanation of both.

---

## 1. Architecture summary

- **`Report`** — thin envelope (`ReportDomain`, `ReportStatus`, `reporterFingerprintHash`, dedup/
  moderation state). Points DOWN to exactly one of the two domain tables via a discriminated-union pair
  of nullable `@unique` FKs — mirrors Bronze Fortress's `Evidence` table
  (`apps/bronze-fortress/backend/prisma/schema.prisma`), which does the same thing for its five
  structured-intake tables.
- **`MedicalAdverseEventReport`** / **`SocialEconomicImpactReport`** — the structured questionnaire
  answers. Closed enums do the aggregatable work; a `freeTextElaboration` field exists for human review
  only and is never read by any aggregation query, per BF's own stated principle: *"Free text is
  reidentifying and unqueryable. Structured answers are aggregatable and privacy-preserving."*
  (`BRONZE_FORTRESS.md`).
- **Aggregation, not citation.** A thesis will eventually cite a computed pattern ("347 reports of X
  within window Y"), never a single `Report` row — the query layer that computes that pattern is not
  yet built (see §5).
- **No individual on-chain anchoring.** Unlike `Evidence`, individual reports are not hashed on-chain —
  volume and privacy make that meaningless per-row; if aggregate integrity ever needs a tamper-evident
  anchor, it anchors the aggregate dataset hash, not this table.

---

## 2. Taxonomy — grounding and rationale

Every enum value below was chosen from real published/official sources, not invented — the same
discipline as `investigativeCategories.ts`'s "could a lawyer put this in front of a court" standard.
This section is the dev-facing record; §4 turns the same material into public-facing copy.

### 2.1 `MedicalSymptomCategory` + severity

- **Structure inspired by MedDRA System Organ Class** (the VAERS/EudraVigilance pharmacovigilance
  convention — ~26 SOCs), trimmed to what's actually been reported for COVID vaccines rather than the
  full taxonomy. MedDRA terminology itself is MSSO-licensed; category names here are original,
  plain-language, organ-system-grouped — not a claim of MedDRA compliance.
  [Trivalent Influenza Vaccine Adverse Event Analysis Based On MedDRA SOCs Using VAERS Data (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4946634/)
- **`seriousness`** uses VAERS/FDA's own legal "serious AE" criteria (hospitalization, life-threatening,
  permanent disability, death, congenital anomaly) rather than an invented MILD/MODERATE/SEVERE scale.

### 2.2 `ONCOLOGIC` + cancer sub-fields

A 2026 *Oncotarget* review (69 publications, 300+ patients, Jan 2020–Oct 2025) found a genuine,
published signal pattern: de novo diagnoses, recurrence of previously controlled disease,
**"hyperprogression"** (their term for unusually rapid/aggressive course — the clinical name for what's
colloquially called "turbo cancer"), atypical presentation (injection-site/regional lymph node
involvement), and viral-reactivation-associated cancers. Most frequent: lymphomas (43%), solid tumors
incl. breast/lung/pancreatic/glioblastoma (41%). Authors are explicit: *"temporal association does not
establish causation"* — hypothesis-generating, not proof. `CancerCourse.UNUSUALLY_RAPID_PROGRESSION`
uses the literature's own term deliberately — see `defamation-risk.md` Rule 2 ("never assert beyond
what's documented"); the informal term reads as pre-concluded, the clinical term doesn't.
[COVID vaccination and post-infection cancer signals (Oncotarget/PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12893478/)

### 2.3 `NEUROCOGNITIVE_PVS` + cognitive sub-fields

Added after a gap was flagged: "brain fog" was originally just a parenthetical example inside
`NEUROLOGICAL`, alongside severe acute conditions like Guillain-Barré. Research showed this
undercounts the single largest reported cluster, not a minor one:

- **"Post-COVID-19 Vaccination Syndrome" (PCVS/PVS)** is an emerging diagnosis in the 2025–2026
  literature (Yale, University Hospital Erlangen, a Japanese 14-clinic registry), defined as a
  *multisystemic* cluster — fatigue, post-exertional malaise, dysautonomia, neuropathic pain, and
  cognitive impairment (brain fog, memory problems) — not an isolated neurological symptom.
  [Cognitive impairment, depression, and fatigue in post-COVID and post-vaccination syndrome (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC12904920/) ·
  [Breaking the silence: Recognizing post-vaccination syndrome (Heliyon)](https://www.cell.com/heliyon/fulltext/S2405-8440(25)01864-X)
- A 2026 VAERS analysis found cognitive-impairment reports at **PRR 118** vs. influenza vaccine —
  "brain fog" specifically reported over 100× more frequently.
  [Updated profiling of COVID-19 vaccine adverse events using VAERS case reports (Frontiers in Pharmacology, 2026)](https://www.frontiersin.org/journals/pharmacology/articles/10.3389/fphar.2026.1741967/full)
- A Japanese 14-clinic registry found nervous-system-disorder reports — dominated by brain fog and
  dizziness — at **22.3%** of all reported events: the largest single cluster, not a rare tail.
  [Characterizing persistent Post-COVID-19 vaccination symptoms using MedDRA SOC/PT classifications (Scientific Reports)](https://www.nature.com/articles/s41598-026-43949-z)
- `postExertionalMalaise` is captured as its own boolean because PVS is clinically defined as a
  *cluster* — capturing PEM co-occurrence lets aggregation distinguish "full PVS-pattern" reports from
  an isolated symptom.

### 2.4 `symptomPersistence` (schema-wide, not category-scoped)

PVS is clinically defined by **persistence** (long-COVID-style, commonly a 3-month threshold), not mere
presence. This field was initially drafted scoped only to `NEUROCOGNITIVE_PVS`, then widened schema-wide
after review — the same distinction (ongoing vs. resolved) is evidentiary for every category: an
ongoing cardiac symptom, an unresolved autoimmune flare, and a resolved rash are not the same claim.
Per this project's standing rule to close known gaps immediately rather than defer them — migrating a
scoped field to schema-wide later, once real rows exist, is materially harder than doing it now.

### 2.5 `SocialEconomicImpactCategory` + `formalBasisAsserted`

- **Employment/military categories have the strongest evidentiary footing in this whole schema.** Of
  ~10,000 COVID-era EEOC discrimination charges, **9,800 alleged Title VII religious-accommodation
  denial** — the dominant, formally-tracked category, not a marginal one.
  [Spike in Religious Discrimination Charges Stemming from COVID-19 Vaccine Mandates (Workplace Class Action Blog)](https://www.workplaceclassaction.com/2023/07/spike-in-religious-discrimination-charges-stemming-from-covid-19-vaccine-mandates-fuels-increase-in-eeoc-charges/)
- **8,000+ servicemembers** were involuntarily discharged for vaccine refusal, many after documented
  "rubber-stamp" religious exemption denials (a federal judge's own characterization in *Navy SEALs
  1-26 v. Biden*). DoD now runs an **official reinstatement program** with back pay — government
  acknowledgment, not a contested claim.
  [Vaccine Mandates in the Military: Litigation Over Religious Exemptions (Harvard Petrie-Flom Center)](https://petrieflom.law.harvard.edu/2022/03/30/vaccine-mandates-in-the-military-litigation-over-religious-exemptions/) ·
  [Executive Order Gives Service Members Discharged Under Military's COVID-19 Vaccine Mandate Path to Reinstatement](https://www.militaryjusticeattorneys.com/blog/2025/february/executive-order-gives-service-members-discharged/)
- `ACCESS_DENIAL_SERVICES` reflects real documented mechanisms (e.g. NYC's "Key to NYC Pass" gating
  entry to work/dining/venues).
  [How do COVID-19 vaccine mandates affect participation in mandate-affected activities? (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC8888038/)
- **`FAMILY_RELATIONSHIP_RUPTURE` / `SOCIAL_OSTRACIZATION` carry deliberately weaker evidentiary
  backing** — real and qualitatively documented (healthcare-worker literature describes
  "marginalisation," "extreme distress requiring counselling"), but no systematic quantification tying
  family estrangement specifically to vaccination disagreement was found. Same epistemic tier as
  `CancerCourse.UNUSUALLY_RAPID_PROGRESSION` — the display/aggregation layer must not flatten this
  distinction when it's built (§5).

### 2.6 `outcomeStatus` (schema-wide, `SocialEconomicImpactReport`)

The social/economic analog of `symptomPersistence` — same underlying gap (nothing captured whether a
reported consequence is still in effect), closed the same way, at the same time, for the same reason.
Grounded in a documented real mechanism, not a hypothetical: DoD's reinstatement program means a
`MILITARY_DISCHARGE` report where that happened is a materially different claim from one where it
didn't — the schema must be able to say which.

### 2.8 Reporter anonymity, consent, and demographics — GDPR-driven redesign, 2026-08-20

Prompted by the user asking, mid-Phase-3-design, whether this feature introduces a new PII/GDPR
concern. It did, and working through it changed `Report`'s shape twice in one session.

**Special-category data.** `MedicalAdverseEventReport` is health data (GDPR Art. 9(1)) outright.
`FormalBasisAsserted.RELIGIOUS_ACCOMMODATION_DENIED` reveals religious belief — also Art. 9(1). Both
need a stronger legal basis than ordinary personal data — explicit, specific consent (Art. 9(2)(a)),
not an inferred "you clicked submit." **Fixed**: `Report.consentGiven: Boolean`, no default, mirroring
`Whistleblower.consentGiven` — the intake endpoint must reject any submission where this isn't
explicitly true.

**The original `reporterFingerprintHash` design (§ old Phase 2) was pseudonymization, not
anonymization — and that distinction has teeth.** A deterministic hash of a verified email, even a
slow one-way one (`scrypt`), doesn't anonymize under GDPR (Recital 26; WP29 Opinion 05/2014 on
Anonymisation Techniques): the controller holds the salt, so given *any* candidate email later — a
subpoena, a breach, plain curiosity — they can hash it and test for a match. That candidate-matching
capability is the whole test. A hash engineered to be untestable (e.g. a random salt discarded
immediately) is functionally identical to storing nothing, just with extra bytes — so **the honest
design is to store nothing.**

**Decided**: `Report` retains *no* field derived from the reporter's identity — no hash, no
fingerprint. This sacrifices cross-report dedup by design (the whole point of the original field). User
judgment on the trade-off: duplicate-report risk is lower priority than the GDPR exposure, and
per-submission live email verification is already a real barrier to trivial spam — reinforced by
`generalLimiter`'s existing ordinary rate limiting (`server.ts`) still applying regardless. Corollary,
named explicitly rather than discovered later: a reporter can never prove a specific report is theirs
after the fact (e.g. to request its deletion) — true anonymity and self-service retraction of one
report are mutually exclusive with this design, not an oversight.

**What changed mechanically**: `reporterFingerprintHash` (and its index) dropped from `Report`;
`src/lib/reporterFingerprint.ts` and its test deleted outright as dead code, not left unused.
Migration `20260820020000_report_anonymize_and_consent` (offline schema-diff generated, applied to
staging, independently verified — the column now genuinely errors on `SELECT`, not just absent from a
list). The Supabase-Auth-account question from the verification-mechanism decision (§6, old) still
applies — the account should still be deleted post-verification as defense-in-depth (removes the one
*easy, standing* directory of who reported), even though it isn't what makes the design anonymous;
Phase 3 must implement that deletion, not treat it as optional.

**Reporter demographics — added the same session, same rigor.** User wanted age/gender: real
pharmacovigilance value (the myocarditis-post-mRNA-vaccine signal was first detected specifically as
elevated in young males — an age+sex-stratified finding a flat aggregate would have missed), pushed
back on "not identifying anyone" as the premise (age+gender are classic *quasi-identifiers* —
Sweeney's ZIP+birthdate+gender re-identification result is the canonical example — harmless alone,
narrowing in combination with a rare category or small aggregate cell), landed on: collect it, but
bucketed, the same date-fuzzing logic already applied to timing. `Report.reporterAgeRange`
(`ReporterAgeRange`, ~15-year bands past 18) and `Report.reporterGender` (`ReporterGender`: FEMALE /
MALE / OTHER / UNKNOWN, the last doubling as "prefer not to say"), both `@default(UNKNOWN)`. Migration
`20260820030000_report_reporter_demographics`, applied to staging, verified. Hebrew/English labels
added immediately (`src/lib/reporterDemographicLabels.ts`, `messages/{he,en}.json` under
`reporterAgeRanges`/`reporterGenders`), same diff-against-real-Prisma-enum verification as §2.7.

**This reinforces, not just parallels, Phase 9's suppression-threshold requirement** (§5) — age/gender
are exactly the kind of field that makes a small aggregate cell re-identifying. That requirement now
covers demographic fields specifically, not only the taxonomy categories.

---

## 3. Known limitation this document does not resolve

`vaccineManufacturer` and `doseNumber` were added to `MedicalAdverseEventReport` as an editorial
judgment call (a vaccine-AE schema without a product field is incomplete — VAERS always captures this)
rather than from a specific research citation in this session. Flagged here so it reads as a documented
decision, not an unflagged gap.

---

## 4. Public-facing copy — draft for the intake UI

**Not yet wired to any UI** (no intake frontend exists yet — see §5). Drafted now so the rationale
doesn't have to be re-derived when the frontend is built. English only; needs Hebrew translation into
`apps/glass-fortress/frontend/messages/he.json` at implementation time, following the existing
`messages/en.json`/`he.json` namespace pattern used elsewhere in the app.

**Note — this is the explanatory prose only, not the category labels.** The enum *value* labels (e.g.
"NEUROCOGNITIVE_PVS" → "קוגניטיבי (תסמונת שלאחר חיסון)") are a separate, already-completed piece of
work — see §2.7 below. §4's "why we ask this" paragraphs are still English-only.

### 2.7 Hebrew/English category labels ✅ DONE 2026-08-20

Every Medical-domain enum (`MedicalSymptomCategory`, `MedicalSeriousness`, `CancerPresentationType`,
`CancerCourse`, `CancerType`, `CognitiveSymptomType`, `SymptomPersistence`, `VaccineManufacturer`) plus
the shared `ReportTimingWindow` now has real Hebrew and English UI labels, not translated casually:
`src/lib/reportCategoryLabels.ts` (backend source of truth, `Record<PrismaEnum, string>` per enum — the
type itself forces every enum member to be covered, catching any gap at compile time) mirrored into
`messages/he.json`/`messages/en.json` under matching namespaces (`medicalSymptomCategories`,
`cancerTypes`, etc.), the same duplication `investigativeCategoriesField`'s labels already require
across the Express/Next.js boundary.

Two terms have no settled Hebrew medical equivalent (confirmed by search, not assumed) and use a
transliteration + plain-Hebrew gloss instead of inventing false authority: `NEUROCOGNITIVE_PVS` →
"קוגניטיבי (תסמונת שלאחר חיסון)" ("post-vaccination syndrome" is itself emerging English terminology)
and `CancerCourse.UNUSUALLY_RAPID_PROGRESSION` → "התקדמות מהירה באופן חריג (היפרפרוגרסיה)"
("hyperprogression" has no established Hebrew translation in the literature searched). Verified two
ways: `tsc` (the `Record` type catches any missed/misspelled enum member) and a direct programmatic
diff of the JSON files' keys against the real `@prisma/client` enum values — both came back clean, not
just eyeballed.

**Update — done, not deferred**: `SocialEconomicImpactReport`'s enums got their own labeling pass the
same day (`src/lib/socialEconomicCategoryLabels.ts`), using real Israeli employment/disability-law
terms ("התאמה דתית"/"התאמה סבירה", confirmed via search against nevo.co.il/kolzchut.org.il) rather than
literal translations of the American EEOC terminology the categories were originally grounded in — see
that file's header comment. `Report`'s own new demographic fields (§2.8) are labeled too
(`reporterDemographicLabels.ts`).

### 4.1 Why we ask what we ask (methodology blurb — intended for a collapsible "About this data" section on the report form)

> This form's categories aren't arbitrary. Each one is grounded in published research, official
> government data, or established adverse-event reporting standards — not in what sounds compelling.
> Where the evidence is strong (e.g. employment/military consequences, tracked directly by the EEOC and
> the Department of Defense), we say so. Where it's weaker — real, but not yet systematically studied
> (e.g. family estrangement) — we say that too. A single report here is not proof of anything; it
> becomes meaningful only in aggregate, alongside many others, the same way official vaccine safety
> surveillance systems work.

### 4.2 Per-section "why we ask this" copy

**Medical — symptom category:**
> Our categories follow the same organ-system structure used in official vaccine safety databases
> (VAERS in the US, EudraVigilance in Europe), adapted to conditions people have actually reported after
> COVID-19 vaccination. Cognitive symptoms — brain fog, memory or concentration difficulty — have their
> own category, separate from severe acute neurological events, because they are the single
> most-reported symptom cluster in existing research, not a rare exception.

**Medical — cancer questions:**
> If you're reporting a cancer diagnosis or a change in an existing cancer, we ask a few extra
> questions — whether it's a new diagnosis or a recurrence, and whether the course was unusually rapid.
> A 2026 review of published medical case reports found a real, documented pattern of these questions
> mattering; the same review is explicit that this is a hypothesis worth investigating, not proof of
> cause and effect. We ask the same way the researchers did.

**Medical — ongoing vs. resolved:**
> Whether a symptom went away or is still affecting you matters — a lot. We ask this for every
> category, not just some, because the difference between "it happened once" and "it hasn't stopped" is
> often the most important fact in the report.

**Social/economic — employment and military:**
> Of the roughly 10,000 COVID-era discrimination charges filed with the U.S. EEOC, 9,800 alleged
> religious-accommodation denial — this is the best-documented consequence in this entire form. Over
> 8,000 servicemembers were discharged for vaccine refusal; the Department of Defense now runs an
> official reinstatement program. If either happened to you, telling us whether it was resolved (e.g.
> reinstatement) or still stands is as important as the original event.

**Social/economic — family and social impact:**
> We include family estrangement and social ostracization because real people have reported them, and
> qualitative research on healthcare workers documents real distress. We're honest that this is less
> systematically studied than the employment/military categories above — your report still matters, but
> we won't overstate what the evidence shows.

### 4.3 Per-question help text

Bilingual (English/Hebrew) from the start, unlike §4.1-4.2 — written after the Hebrew terminology work
in §2.7/socialEconomicCategoryLabels.ts, so these reuse the exact verified terms rather than
re-translating loosely. Intended as inline help text/tooltips beside each form field, not the
collapsible section §4.1 describes. One to three sentences each, per the "short paragraph" brief —
long enough to explain the *why*, short enough to actually get read.

**Medical form**

| Field | EN | HE |
|---|---|---|
| `symptomCategory` | Which body system or type of effect best describes what happened. We ask this first because it determines which follow-up questions apply. | לאיזו מערכת בגוף או סוג תופעה הכי מתאים מה שקרה. אנו שואלים זאת ראשית כי היא קובעת אילו שאלות המשך יופיעו. |
| `seriousness` | Whether the outcome met the official "serious adverse event" criteria used by vaccine safety systems like VAERS — hospitalization, life-threatening, permanent disability, death, or a birth defect. Not a subjective severity rating; it's the same legal definition regulators use. | האם התוצאה עמדה בקריטריונים הרשמיים ל"תופעת לוואי חמורה" כפי שמוגדרים במערכות בטיחות חיסונים כמו VAERS — אשפוז, סכנת חיים, נכות קבועה, פטירה או מום מולד. זו אינה הערכת חומרה סובייקטיבית, אלא אותה הגדרה משפטית שבה משתמשים הרגולטורים. |
| `cancerPresentationType` *(if Oncologic)* | Whether this is a brand-new diagnosis or a recurrence/progression of cancer you already had. Published research treats these as distinct signals. | האם מדובר באבחנה חדשה לגמרי או בהישנות/התקדמות של סרטן שכבר היה קיים. מחקרים שפורסמו מתייחסים לאלה כאותות נפרדים. |
| `cancerCourse` *(if Oncologic)* | Whether the disease progressed at a typical pace or unusually quickly. We use the same words the published research uses, not the more dramatic terms sometimes used online — see the methodology note above. | האם המחלה התקדמה בקצב אופייני או במהירות חריגה. אנו משתמשים באותה לשון שבה משתמש המחקר שפורסם, לא במונחים הדרמטיים יותר הנפוצים לעיתים ברשת — ראו הערת המתודולוגיה למעלה. |
| `cancerAtypicalFeatures` | Whether the cancer showed up at or near the injection site, or in nearby lymph nodes — a specific pattern noted in several published case reports. | האם הסרטן הופיע באזור מקום ההזרקה או בסמוך אליו, או בבלוטות לימפה סמוכות — דפוס ספציפי שתועד במספר דוחות מקרה שפורסמו. |
| `cancerType` | The type of cancer involved. If you don't know yet, choose "Not yet typed" rather than guessing — an honest "don't know" is more useful to us than a wrong guess. | סוג הסרטן. אם עדיין אינך יודע/ת, בחר/י "טרם סווג" במקום לנחש — "לא יודע/ת" מועיל לנו יותר מניחוש שגוי. |
| `cognitiveSymptomType` *(if Neurocognitive)* | Which cognitive symptom best describes what you experienced. Brain fog, memory problems, and concentration difficulty are tracked separately because they're the most-reported symptom cluster in current research — not a rare or minor complaint. | איזה תסמין קוגניטיבי הכי מתאר את מה שחווית. ערפל מוחי, בעיות זיכרון וקושי בריכוז נעקבים בנפרד כי הם אשכול התסמינים המדווח ביותר במחקר הנוכחי — לא תלונה נדירה או שולית. |
| `postExertionalMalaise` | Whether physical or mental exertion noticeably worsens your symptoms afterward. A specific, recognized feature of post-vaccination syndrome — not a general "do you get tired" question. | האם מאמץ גופני או נפשי מחמיר בבירור את התסמינים לאחר מכן. זהו מאפיין ספציפי ומוכר של תסמונת שלאחר חיסון, לא שאלה כללית של "האם את/ה מתעייף/ת". |
| `symptomPersistence` | Whether the symptom has resolved or is still ongoing. Often the single most important fact in a medical report — the difference between something that happened once and something that hasn't stopped. | האם התסמין חלף או שהוא עדיין נמשך. זו לעיתים קרובות העובדה החשובה ביותר בדיווח הרפואי — ההבדל בין משהו שקרה פעם אחת למשהו שלא נפסק. |
| `vaccineManufacturer` | Which vaccine manufacturer. Vaccine safety databases always track this, since reaction patterns can differ between products. | מהו יצרן החיסון. מאגרי בטיחות חיסונים תמיד עוקבים אחר נתון זה, מכיוון שדפוסי תגובה עשויים להשתנות בין המוצרים השונים. |
| `doseNumber` | Which dose in the series (first, second, booster, etc.) preceded the symptom. Reaction patterns are often dose-specific. | איזו מנה בסדרה (ראשונה, שנייה, מנת דחף וכו') קדמה לתסמין. דפוסי תגובה הם לעיתים קרובות ספציפיים למנה. |
| `onsetWindow` | How long after vaccination the symptom began. We ask for a time range, not an exact date, to protect your privacy — only the range is ever shown publicly. | כמה זמן לאחר החיסון החל התסמין. אנו מבקשים טווח זמן, לא תאריך מדויק, כדי להגן על פרטיותך — רק הטווח מוצג אי פעם באופן פומבי. |
| `medicalAttentionSought` | Whether you sought medical attention for this. Not a requirement to report — many real reactions never reach a doctor — but it helps us understand the pattern. | האם פנית לטיפול רפואי בעקבות זאת. אין חובה לדווח על כך — תגובות אמיתיות רבות לעולם אינן מגיעות לרופא — אך זה עוזר לנו להבין את הדפוס. |
| `diagnosisConfirmedByProvider` | Whether a healthcare provider formally confirmed the diagnosis. Doesn't gate whether your report is accepted, but it affects the confidence level assigned to it in any aggregate analysis. | האם איש מקצוע רפואי אישר את האבחנה באופן פורמלי. הדבר אינו קובע האם הדיווח יתקבל, אך הוא כן משפיע על רמת הביטחון שתיוחס לו בכל ניתוח מצטבר. |
| `preExistingCondition` | Whether you had this condition, or a related one, before vaccination. Matters for telling a new event apart from a known one. | האם היה לך מצב זה, או מצב קשור, לפני החיסון. הדבר חשוב כדי להבחין בין אירוע חדש לבין מצב ידוע מראש. |
| `freeTextElaboration` | Optional space to describe what happened in your own words. Helps our reviewers understand context, but isn't used in any statistical count — only the structured answers above are. | מקום רשות לתיאור מה שקרה במילים שלך. הדבר עוזר לצוות הבודק להבין את ההקשר, אך אינו נכלל בשום ספירה סטטיסטית — רק התשובות המובנות שלמעלה נכללות. |

**Social/economic form**

| Field | EN | HE |
|---|---|---|
| `impactCategory` | Which kind of consequence you experienced. Employment and military categories have the strongest documentation behind them (see the methodology note); family and social categories are real but less formally studied — we're upfront about that difference. | איזה סוג של השלכה חווית. קטגוריות התעסוקה והצבא הן בעלות התיעוד החזק ביותר (ראו הערת המתודולוגיה); קטגוריות המשפחה והחברה אמיתיות אך פחות מתועדות באופן שיטתי — אנו גלויים לגבי ההבדל הזה. |
| `formalBasisAsserted` | What formal grounds, if any, were given for the decision — a denied religious accommodation, a denied medical/disability accommodation, or none stated. The single best-documented data point in this whole form. | אילו נימוקים רשמיים, אם בכלל, ניתנו להחלטה — סירוב בקשת התאמה דתית, סירוב בקשת התאמה רפואית/נכות, או שלא צוינה עילה. זהו נקודת הנתון המתועדת ביותר בטופס כולו. |
| `consequenceSeverity` | The kind of harm that followed — lost income, lost benefits, a derailed career, a broken relationship, or financial/housing hardship. | סוג הפגיעה שנגרמה — אובדן הכנסה, אובדן זכויות, פגיעה בקריירה, קרע בקשר, או מצוקה כלכלית/דיור. |
| `outcomeStatus` | Whether the consequence is still in effect, was reversed (e.g. reinstated), or stands unchanged. Matters as much as the original event — a servicemember reinstated with back pay is materially different from one still discharged. | האם ההשלכה עדיין בתוקף, בוטלה (למשל שיקום בתפקיד), או נותרה ללא שינוי. הדבר חשוב לא פחות מהאירוע המקורי — חייל/ת ששוקם/ה עם שכר רטרואקטיבי נמצא/ת במצב שונה מהותית ממי שעדיין מפוטר/ת. |
| `documentationAvailable` | Whether you have a paper trail — a termination letter, a discharge order, a complaint filed with an agency. Like the medical form's provider-confirmation question, this doesn't gate acceptance, but it affects confidence. | האם יש בידך תיעוד — מכתב פיטורים, צו שחרור, תלונה שהוגשה לרשות. בדומה לשאלת אישור הרופא בטופס הרפואי, הדבר אינו תנאי לקבלת הדיווח, אך הוא משפיע על רמת הביטחון. |
| `timingRelativeToEvent` | How long after vaccination this happened. As with the medical form, we ask for a time range rather than an exact date to protect your privacy. | כמה זמן לאחר החיסון זה קרה. כמו בטופס הרפואי, אנו מבקשים טווח זמן ולא תאריך מדויק כדי להגן על פרטיותך. |
| `freeTextElaboration` | Optional space to describe what happened in your own words — for reviewer context, not included in any statistical count. | מקום רשות לתיאור מה שקרה במילים שלך — להקשר עבור הצוות הבודק, ואינו נכלל בשום ספירה סטטיסטית. |

Not yet added to `messages/he.json`/`en.json` — these are prose, best wired in as part of Phase 8 (the
actual intake form), not added as bare namespace entries the way §2.7's category labels were.

---

## 5. Implementation phases

Ordered by dependency, not by importance — §5.6 (aggregation) is the actual point of this feature per
§0, but it can't be built before something exists to aggregate. Each phase lists what it produces, what
it depends on, and any open design question it must resolve before code gets written (this project's
own standard: no "for now" scoping — close it now or record explicitly why it's out of scope).

### Phase 1 — Migration ✅ DONE 2026-08-20
Generated offline via `prisma migrate diff --from-schema-datamodel ... --to-schema-datamodel ...
--script` (no database connection needed for generation — pure schema comparison), written to
`prisma/migrations/20260820010000_adverse_event_reports/migration.sql`. Purely additive — 16
`CREATE TYPE`, 3 `CREATE TABLE`, 3 indexes, 2 FKs, zero `ALTER`s to any existing table. **Applied to
staging** via `prisma migrate deploy` (user-approved); `prisma migrate status` confirmed "up to date"
immediately after. Independently re-verified beyond the CLI's own status message: direct
`SELECT 1 FROM "<table>" LIMIT 1` against all three new tables succeeded with no error — a query
against a nonexistent Postgres table always errors, so silent success is real proof, not a trusted
flag (same evidentiary standard as `feedback-evidentiary-proof-standard.md`).

### Phase 2 — Reporter identity & intake validation ✅ DONE 2026-08-20
- **Verification mechanism: Supabase magic-link email** (decided earlier this phase), reusing GF's
  existing Supabase auth infra. Zero new vendor cost, no SMS/OTP billing.
- **`reporterFingerprintHash` formula, implemented**: `src/lib/reporterFingerprint.ts` —
  `scrypt(normalizeEmail(email), REPORTER_FINGERPRINT_SALT, 64)`. Revised from the original schema
  comment's "email + a device/session signal" down to email alone — the device signal was speculative
  when the comment was written and adds privacy surface (storing IP/user-agent) without a clear benefit
  once email is the verified identity anchor. Uses `scrypt`, not `tokenHash.ts`'s HMAC-SHA256, because
  that file's own header comment explicitly says HMAC-SHA256 is only safe for high-entropy random
  tokens and calls out low-entropy inputs (passwords, and by the same logic, emails) as unsafe for
  it — this is that documented exception applied correctly. Static salt (not per-record random),
  required so dedup lookups stay deterministic. Whether the plaintext email itself is retained
  post-verification or discarded remains open — Phase 10.
- **zod schemas for both domain payloads**: `src/lib/reportIntakeSchemas.ts`, enforcing the
  "cancer-prefixed fields only when `ONCOLOGIC`, cognitive-prefixed fields only when
  `NEUROCOGNITIVE_PVS`" rule via `superRefine` — the DB can't enforce it, so this is where
  `schema.prisma`'s own "validated at the intake boundary" comments actually get kept. Enums use
  `z.nativeEnum(...)` against the generated `@prisma/client` types rather than hand-copied string
  tuples (a deliberate deviation from `investigativeCategoriesField`'s convention, documented in the
  file header — that convention exists because `investigativeCategories` was deliberately kept out of
  Prisma entirely, so there was nothing to import; these 13 enums *are* real Prisma enums, and
  hand-copying that many literal unions would be a drift risk the existing convention never had to
  solve). `freeTextElaboration` got a 5000-char cap at the validation boundary — not in the Prisma
  column (unbounded `text`) or discussed when the schema was designed, added here as a standard public-
  input abuse guard.
- **Gap surfaced, not fixed**: `CancerCourse` has no `UNKNOWN` member, so a reporter who doesn't know
  whether progression was "unusually rapid" has no honest answer — `cancerCourse`/`cancerPresentationType`
  stay optional even when `ONCOLOGIC` rather than forcing a guess. Unlike the `symptomPersistence`/
  `outcomeStatus` gaps closed earlier in this plan, this one wasn't closed immediately — flagged for a
  decision (add `CancerCourse.UNKNOWN`, another small additive migration) rather than assumed away.
- **Verified**: 16 new Jest tests (`test/reporterFingerprint.test.ts`, `test/reportIntakeSchemas.test.ts`)
  plus the full existing suite (692/692) pass; `tsc --noEmit` clean.

### Phase 3 — Public intake API ✅ DONE 2026-08-20
`POST /api/reports/medical`, `POST /api/reports/social-economic` (`src/routes/reportRoutes.ts`) — no
researcher gate, open submission, always `PENDING_REVIEW` (the Prisma default; nothing in the service
sets status explicitly, so it fails closed the same way `Evidence.status` does).

**Auth**: `requireVerifiedReporterEmail` (`src/middleware/supabaseAuth.ts`) — a new middleware alongside
`requireSupabaseAuth`, sharing a refactored-out `getSupabaseUser` helper so `verifySupabaseUserId`'s
existing behavior for `Researcher` auth is unchanged (688 pre-existing tests plus new coverage confirm
this). Verifies the Supabase magic-link token, then **immediately deletes the Supabase Auth account**
via the Admin API (`SUPABASE_SERVICE_ROLE_KEY`, same env var `StorageService` already uses for a
different purpose) before calling `next()` — fails closed (500, no `next()`) if deletion errors or
throws, since a report that was supposed to leave nothing behind must not proceed if that guarantee
can't be met. Sets `req.reporterVerified = true` only; the email itself never leaves the middleware's
scope, matching §2.8's design exactly.

**Request shape**: `{ consentGiven: true, reporterAgeRange?, reporterGender?, report: {...domain fields} }`.
`consentGiven` is `z.literal(true, {...})` — the exact pattern already shipped in
`evidenceRoutes.ts`'s `ContactBodySchema` for `Whistleblower.consentGiven` — so `false` or missing both
400, not just missing. Demographics default to `UNKNOWN` via zod, matching the Prisma column defaults.

**Creation**: `src/services/reportIntake.ts` — a single nested Prisma `create` (`Report` with
`medicalReport: { create: payload }` / `socialEconomicReport: { create: payload }`), which Prisma runs
as one implicit transaction — no manual `$transaction` needed, and it structurally can't produce a
`Report` without its domain row or vice versa.

**Verified**: 24 new tests (`test/supabaseAuth.test.ts` covers the middleware directly — success path,
missing/invalid token, and both delete-failure modes fail closed; `test/reportRoutes.test.ts` covers
validation and creation with the middleware mocked as a pass-through), full suite 706/706, `tsc` clean.
Fixed two zod APIs that were deprecated in this project's zod v4 with zero existing precedent to match
(`z.nativeEnum` → `z.enum`, `z.ZodIssueCode.custom` → `'custom'`) — left `.flatten()` and env-var
bracket-notation alone, since those exactly match this codebase's own already-shipped dominant
convention (`evidenceRoutes.ts`, `tokenHash.ts`, etc.) and diverging in one new file would create
inconsistency, not cleanliness.

### Phase 4 — `ReportPlausibilityService`
Rule-based, deterministic — not LLM-driven, matching BF's `PatternDetectionService` precedent rather
than trusting a model's judgment on fraud signals. **Revised post-§2.8**: no `reporterFingerprintHash`
exists anymore, so there is no cross-submission velocity/dedup signal to check against — that
capability was deliberately traded away for genuine anonymity (§2.8). What remains: ordinary IP-based
rate limiting (`generalLimiter`, already applied to all of `/api`) and internal-consistency rules
within a single submission (e.g. `seriousness = DEATH` with `medicalAttentionSought = false` is a
plausibility flag, not an auto-reject). Sets `ReportStatus.FLAGGED_IMPLAUSIBLE` vs. leaving
`PENDING_REVIEW`. Depends on Phase 3 (done) existing to flag against.

### Phase 5 — Researcher moderation
A review queue (REST route, or an MCP tool mirroring `promote_evidence`) for a `Researcher` to move
`PENDING_REVIEW` → `PUBLISHED` / `REJECTED_DUPLICATE` / `REJECTED_SPAM`. Reuses the existing `Researcher`
role gate — no new auth system. Depends on Phase 4 (queue is more useful pre-filtered by plausibility,
though not strictly blocking).

### Phase 6 — Aggregation / pattern-detection layer
The actual point of this model (§0): a `ReportPatternService` with `groupBy` queries over `PUBLISHED`
rows only, keyed on `(domain, category, timingWindow/persistence)` — the direct analog of BF's
`AllegationService.getPatternCountsByFigure`. Must exclude non-`PUBLISHED` rows by construction, not by
caller discipline, mirroring the `CONFIRMED`-must-be-real-proof standard already enforced for `Evidence`.

### Phase 7 — Thesis citation wiring (open design question, not yet decided)
How does a thesis actually cite a report aggregate? `ThesisMention.type` today is a closed enum
(`KEY_FIGURE` / `EVIDENCE` / `TRACKED_URL`), each pointing at a real row by ID. A report aggregate isn't
a row — it's a computed query result ("347 reports of X in window Y"). Needs its own design pass before
implementation: likely a new `MentionType.REPORT_PATTERN` whose `refId` encodes a query descriptor
rather than a database ID, but that's a proposal, not a decision — flag for discussion when this phase
starts.

### Phase 8 — Frontend public intake form
Multi-step questionnaire (domain → category → conditional sub-fields → contact verification → submit),
Hebrew-first RTL per the app's existing convention. Wires in §4's methodology copy — **requires Hebrew
translation first** (§4 is English-only today).

### Phase 9 — Frontend public aggregate/pattern display
Public-facing view of report counts by category. Must implement the confidence-tiering distinction
flagged in §2.5 and §2.3: `MILITARY_DISCHARGE`/`EMPLOYMENT_TERMINATION` (EEOC/DoD-backed) and
`ONCOLOGIC`/`NEUROCOGNITIVE_PVS` (peer-reviewed signal, explicitly hypothesis-generating) cannot render
with the same visual weight as `FAMILY_RELATIONSHIP_RUPTURE`/`SOCIAL_OSTRACIZATION` (qualitatively real,
not systematically quantified) — this is a `defamation-risk.md` Rule 2 requirement, not a nice-to-have.
Depends on Phase 6.

### Phase 10 — Legal/compliance pass
`defamation-risk.md`-style review of the Phase 9 display copy once real; reporter consent/terms language
(a report is a public-facing assertion, not a private submission — needs its own declaration, distinct
from `Whistleblower`'s existing "legally obtained material" consent text); privacy review of how
verified contact info is stored (encrypted-at-rest, matching `Whistleblower.encryptedContact`, or
discarded post-verification — undecided, needs its own call).

---

## 6. Recommended next step

Phases 1-3 are done (§5). **Phase 4 (`ReportPlausibilityService`) is next**: rule-based, deterministic
dedup/spam/implausibility flagging — deliberately not LLM-driven, matching BF's
`PatternDetectionService` precedent. Note that Phase 3's anonymity redesign (§2.8) removes the one
signal the original Phase 4 sketch assumed would exist (`reporterFingerprintHash`-based velocity
checks) — Phase 4 needs a fresh design pass against what's actually available now: ordinary IP-based
rate limiting (`generalLimiter`, already applied) and internal-consistency rules within a single
submission, not cross-submission identity linkage. Worth deciding at the start of that phase, not
assumed.
