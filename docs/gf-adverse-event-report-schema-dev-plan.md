# GF Public Adverse-Outcome Self-Reports — Dev Plan

**Status:** Phases 0-4 ✅ DONE (schema, migration, zod validation, bilingual labels for all domains
verified against real Prisma enums, public intake API with `requireVerifiedReporterEmail`). Phase 4
(`ReportPlausibilityService`) was built then fully designed away same-day (§2.9) — both candidate rules
were modeling smells, fixed at the schema level instead (redundant `MedicalSymptomCategory.DEATH`
removed; two booleans collapsed into `medicalCareEngagement`). Phase 5 redesigned twice (§2.10): no
moderation queue (reports count automatically, no per-report human gate), no `freeTextElaboration`, no
`Report.status`/`ReportStatus` at all — there's no state machine left once nothing gates entry.
**Phase 6 (aggregation layer) ✅ DONE for the backend, 2026-08-20** (§5) — `reportDimensions.ts` +
`reportPatternService.ts` (Postgres native `GROUP BY CUBE`, not hand-rolled) + two public aggregate
endpoints, chosen deliberately over Metabase/Superset/Cube.dev to avoid new infrastructure this team's
profile doesn't need. Frontend charting is Phase 9, not started.
**Phase 8 (public intake form) ✅ DONE 2026-08-20** (§5) — `/[locale]/reports/new`, Hebrew-first RTL,
plus the homepage CTA that makes it discoverable at all. The callback design was settled first, as the
handoff note required: **verify first, then answer, with the form page as its own magic-link callback**
— which is what makes it possible to persist *nothing*, rather than writing a health-data draft to
browser storage while the reporter is off checking their inbox. Building it surfaced two real defects
neither the schema nor the API work could have shown: verification was being consumed *before* body
validation (a 400 silently burned the reporter's one-shot magic link), and nothing enforced that the
frontend's label catalogs still matched the Prisma enums they now supply the form's options from. Both
fixed, both with tests. Needs one Supabase config change (Auth redirect allow-list) before it works on
a deployed environment.

Ten staging migrations applied and independently verified this session (query-verified, not just
trusted from `migrate deploy`'s own output). Full suite 786/786 (including 64 label-parity assertions),
`tsc` clean on both backend and frontend, `next build` clean.
**One migration is written but NOT yet applied anywhere** — `20260820090000_cancer_course_unknown`
(§5 Phase 2), generated offline and read, but this machine could not reach the staging Supabase pooler
to apply or verify it. Every other migration in this feature was query-verified against staging; this
one has not been, and must be before the branch is treated as deployed. Also fixed, via
cherry-pick not reinvention, an unrelated schema-drift gotcha (`evidence_embeddings`) a generated
migration almost silently proposed to drop. On branch `schema/gf-adverse-effect-reports`, pushed
through `4e754a8`; this round (Phase 6) not yet committed. See §5 for the full phase-by-phase detail
and §2.x for the reasoning behind each reversed decision — this document is the canonical reference for
the taxonomy's rationale; keep it in sync with `schema.prisma` as the design evolves.
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
  answers. Closed enums do the aggregatable work — no free-text field exists at all, taking BF's own
  stated principle (*"Free text is reidentifying and unqueryable. Structured answers are aggregatable
  and privacy-preserving."*, `BRONZE_FORTRESS.md`) all the way rather than adding one back in for
  "human review" that no design ever actually needed — see §2.10.
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

**Revisited once, deliberately declined — keep this reasoning next time someone proposes bringing the
account back.** After Phase 3 shipped the deletion, the dedup trade-off got re-litigated directly:
*not* deleting the Supabase account would let a duplicate-submission check ride entirely on Supabase's
own unique-email constraint on `auth.users` — no hash, no field on `Report` at all, genuinely simple.
Correct mechanism, but the framing "no problem since `Report` has no hash" was wrong: the persistent
account is its own exposure independent of whatever `Report` does or doesn't store — a permanent list
of every real email that's ever used the feature, even with zero linkage to what any of them reported.
Smaller than the original `reporterFingerprintHash` exposure (no content linkage), but not "no
problem." A bounded-retention middle path was floated (delete after N days — enough to deter
spam/duplicate bursts, not indefinite) and explicitly declined in favor of the existing immediate-
deletion design, to avoid adding complexity without a demonstrated need. If duplicate/spam submissions
become a real, measured problem later, the bounded-retention option is the one to reach for — not
reverting straight to indefinite retention or a fingerprint hash.

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

### 2.9 Two modeling smells found via Phase 4, both designed away — 2026-08-20

Building `ReportPlausibilityService` (Phase 4, §5) surfaced a pattern worth naming as a standing
principle for the rest of this schema, not just a one-off fix: **when a plausibility rule exists to
catch two fields contradicting each other, the fix is usually to the fields, not the rule.** A rule
that detects a contradiction after the fact is a symptom; the schema allowing the contradiction to be
expressed at all is the disease.

**`MedicalSymptomCategory.DEATH` removed.** User's own catch, mid-build: `symptomCategory=DEATH` and
`MedicalSeriousness.DEATH` could independently assert the same underlying fact (a fatal outcome) and
disagree. `MedicalSeriousness.DEATH` is the well-grounded one — it's literally one of FDA's own six
"serious AE" criteria. `symptomCategory=DEATH` was the error: death isn't a physiological system the
way `CARDIOVASCULAR`/`NEUROLOGICAL` are, it's an outcome, which `seriousness` already covers correctly.
Removed the redundant value entirely rather than adding a rule to catch the mismatch — a fatal outcome
with no known underlying system now uses `OTHER` + `seriousness=DEATH`, losing nothing. Migration
`20260820050000_remove_redundant_death_category` (Postgres enum-value removal via the standard
create-new-type/swap/drop-old-type dance, since `ALTER TYPE ... DROP VALUE` doesn't exist).

**`medicalAttentionSought` + `diagnosisConfirmedByProvider` collapsed into `medicalCareEngagement`.**
Subtler version of the same smell: not full duplication, but an *implication* — `diagnosisConfirmedByProvider
= true` should always imply `medicalAttentionSought = true` (a provider can't confirm a diagnosis for
someone who never sought care), but nothing enforced that, so the two booleans could independently
assert the impossible combination. Same fix, ordinal version: `MedicalCareEngagement` (`NOT_SOUGHT` /
`SOUGHT_UNCONFIRMED` / `SOUGHT_CONFIRMED` / `UNKNOWN`) carries identical information to the two
booleans with the invalid state structurally unrepresentable. User-initiated design review — asked
directly whether the *other* plausibility rules also indicated a modeling smell, which is what found
this one and the next.

**`IMPLAUSIBLE_CANCER_DIAGNOSIS_TIMING` removed outright — not a smell, a bug.** This rule (`onsetWindow
= WITHIN_24H` + `cancerPresentationType = NEW_DIAGNOSIS`) assumed `onsetWindow` measured time-to-diagnosis
for oncology reports. It doesn't — the field measures time to first noticeable symptom, for every
category uniformly. A lump can plausibly be noticed within 24 hours of vaccination; the diagnostic
workup (which does take weeks) isn't what this field tracks at all. The rule was checking a signal that
doesn't exist in the schema, so no reframing could fix it — it was deleted, not redesigned.

**Net effect on Phase 4**: once both contradictions were fixed at the field level, there was nothing
left for a `ReportPlausibilityService` to check — see Phase 4 (§5) for the full removal (the service,
its migration, `ReportStatus.FLAGGED_IMPLAUSIBLE`, `Report.flagReasons`, `PlausibilityFlagReason`, all
deleted in the same session they were added, not left as speculative infrastructure for a mechanism
whose premise didn't survive scrutiny).

Three migrations this pass, in order: `20260820040000_report_plausibility_flag_reasons` (added the
now-removed plausibility infrastructure), `20260820050000_remove_redundant_death_category`,
`20260820060000_remove_plausibility_service_collapse_care_engagement` (removed the plausibility
infrastructure again + the `medicalCareEngagement` collapse). All applied to staging, each
independently verified via direct query (a query against a removed column/enum value genuinely errors;
a query against an added one genuinely succeeds — not just trusting `migrate deploy`'s own output).

Also worth recording precisely because it was easy to miss: generating this pass's migration diff
initially proposed `DROP TABLE evidence_embeddings` — a real, non-empty, unrelated table, caught before
it went anywhere near staging. Root cause: this branch's base predates
`fix/gf-evidence-embeddings-schema-drift` (`2de874b`), a real fix for a known standing gotcha (a raw-SQL
pgvector table with no Prisma model, which every naive `migrate diff` proposes to drop) that's merged
elsewhere in the repo but hadn't reached this branch yet. Applied that exact fix manually (a real
cherry-pick was blocked by uncommitted local changes) rather than reinventing it or, worse, letting the
drop through unnoticed. Standing lesson, not specific to this feature: **always read what a generated
migration actually says before applying it** — a diff tool computing "the truth" from an incomplete
model will confidently propose something false.

### 2.10 No moderation queue, no free text — 2026-08-20

User-initiated, mid-Phase-5-planning question: why does a moderation queue exist at all, given the
model expects thousands of reports and already gates legitimacy via live email verification, and
researchers should be spending their time on research, not per-report triage?

**The original Phase 5 plan copied `Evidence`'s review pattern without checking whether the reasoning
transfers, which it doesn't.** `Evidence` needs individual human review because each row is
individually cited — in a thesis, in court, on-chain. `Report` was deliberately designed as the
opposite (§0, session one): "347 reports of X within window Y," never a single row cited on its own.
Requiring a human to approve every report before it counts contradicts the reason the model exists in
this shape — and at real volume, a blanket queue either becomes a bottleneck nobody clears or gets
rubber-stamped, which is worse than no gate at all: it manufactures the appearance of verification
without the substance. Same category of mistake as §2.9, one layer up: a mechanism built to catch a
problem the front door (verified email, consent, schema validation, rate limiting) should already be
handling.

**Decided**: reports count toward the aggregate automatically once they clear the checks that already
exist at submission time. No blanket per-report human gate. Phase 5 is redefined below from "build a
moderation queue" to "there mostly isn't one" — see the rewritten Phase 5 in §5.

**Free text removed as a direct consequence, not a separate cleanup.** The only reason any per-report
human review was ever going to be needed at all was `freeTextElaboration` — specifically, the
possibility it named a real individual before ever being surfaced as an illustrative quote somewhere
public (real defamation exposure, per `defamation-risk.md`). Once the moderation queue was reframed
away, `freeTextElaboration` had no purpose left to serve: it was never grounded in real research the
way every other field in this schema was (unlike, say, `medicalCareEngagement`'s VAERS-provenance
grounding), it directly contradicted the design principle this whole feature borrowed from Bronze
Fortress (*"Free text is reidentifying and unqueryable"*, `BRONZE_FORTRESS.md`), and it was the single
field most likely to re-identify a reporter on its own. Removed entirely from both domain tables —
`FREE_TEXT_MAX`, the zod fields, and their test coverage all removed with it, not left as unused dead
weight. Migration `20260820070000_remove_free_text_elaboration`, applied to staging, independently
verified (both columns now genuinely error on `SELECT`, not just absent from a listing).

Net effect: no moderation queue, no free text, no per-report human touchpoint at all in the steady
state. Spam/abuse defense is now entirely automated (verified email + `generalLimiter`'s existing rate
limiting) — see Phase 5 (§5) for what actually remains for a researcher to do.

---

## 3. Known limitation this document does not resolve

`vaccineManufacturer` and `doseNumber` were added to `MedicalAdverseEventReport` as an editorial
judgment call (a vaccine-AE schema without a product field is incomplete — VAERS always captures this)
rather than from a specific research citation in this session. Flagged here so it reads as a documented
decision, not an unflagged gap.

---

## 4. Public-facing copy — draft for the intake UI

**Wired into the intake UI as of Phase 8** (`reports.methodology` / `reports.{medical,social}` in
`messages/{he,en}.json`) — §4.1/§4.2 as a collapsible "About this data" panel, §4.3 as a per-field
"Why we ask" toggle. The English-only gap noted here originally is closed: §4.1/§4.2 were translated
to Hebrew during Phase 8, reusing §2.7's and `socialEconomicCategoryLabels.ts`'s already-verified
terminology rather than re-translating loosely.

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
| `medicalCareEngagement` | Whether you sought medical attention, and whether a provider formally confirmed the diagnosis. Not a requirement to report — many real reactions never reach a doctor — but it affects the confidence level assigned to your report in any aggregate analysis. (This used to be two separate yes/no questions; they were merged into one so an impossible answer — "confirmed by a doctor" with "never saw a doctor" — can't be given at all.) | האם פנית לטיפול רפואי, והאם איש מקצוע רפואי אישר את האבחנה באופן פורמלי. אין חובה לדווח על כך — תגובות אמיתיות רבות לעולם אינן מגיעות לרופא — אך זה משפיע על רמת הביטחון שתיוחס לדיווח שלך בכל ניתוח מצטבר. (זו הייתה בעבר שתי שאלות כן/לא נפרדות; הן אוחדו לשאלה אחת כדי שלא ניתן יהיה לתת תשובה בלתי אפשרית — "אושר על ידי רופא" יחד עם "מעולם לא פניתי לרופא".) |
| `preExistingCondition` | Whether you had this condition, or a related one, before vaccination. Matters for telling a new event apart from a known one. | האם היה לך מצב זה, או מצב קשור, לפני החיסון. הדבר חשוב כדי להבחין בין אירוע חדש לבין מצב ידוע מראש. |

**Social/economic form**

| Field | EN | HE |
|---|---|---|
| `impactCategory` | Which kind of consequence you experienced. Employment and military categories have the strongest documentation behind them (see the methodology note); family and social categories are real but less formally studied — we're upfront about that difference. | איזה סוג של השלכה חווית. קטגוריות התעסוקה והצבא הן בעלות התיעוד החזק ביותר (ראו הערת המתודולוגיה); קטגוריות המשפחה והחברה אמיתיות אך פחות מתועדות באופן שיטתי — אנו גלויים לגבי ההבדל הזה. |
| `formalBasisAsserted` | What formal grounds, if any, were given for the decision — a denied religious accommodation, a denied medical/disability accommodation, or none stated. The single best-documented data point in this whole form. | אילו נימוקים רשמיים, אם בכלל, ניתנו להחלטה — סירוב בקשת התאמה דתית, סירוב בקשת התאמה רפואית/נכות, או שלא צוינה עילה. זהו נקודת הנתון המתועדת ביותר בטופס כולו. |
| `consequenceSeverity` | The kind of harm that followed — lost income, lost benefits, a derailed career, a broken relationship, or financial/housing hardship. | סוג הפגיעה שנגרמה — אובדן הכנסה, אובדן זכויות, פגיעה בקריירה, קרע בקשר, או מצוקה כלכלית/דיור. |
| `outcomeStatus` | Whether the consequence is still in effect, was reversed (e.g. reinstated), or stands unchanged. Matters as much as the original event — a servicemember reinstated with back pay is materially different from one still discharged. | האם ההשלכה עדיין בתוקף, בוטלה (למשל שיקום בתפקיד), או נותרה ללא שינוי. הדבר חשוב לא פחות מהאירוע המקורי — חייל/ת ששוקם/ה עם שכר רטרואקטיבי נמצא/ת במצב שונה מהותית ממי שעדיין מפוטר/ת. |
| `documentationAvailable` | Whether you have a paper trail — a termination letter, a discharge order, a complaint filed with an agency. Like the medical form's provider-confirmation question, this doesn't gate acceptance, but it affects confidence. | האם יש בידך תיעוד — מכתב פיטורים, צו שחרור, תלונה שהוגשה לרשות. בדומה לשאלת אישור הרופא בטופס הרפואי, הדבר אינו תנאי לקבלת הדיווח, אך הוא משפיע על רמת הביטחון. |
| `timingRelativeToEvent` | How long after vaccination this happened. As with the medical form, we ask for a time range rather than an exact date to protect your privacy. | כמה זמן לאחר החיסון זה קרה. כמו בטופס הרפואי, אנו מבקשים טווח זמן ולא תאריך מדויק כדי להגן על פרטיותך. |

Added to `messages/{he,en}.json` under `reports.medical.*.help` / `reports.social.*.help` during
Phase 8, as intended — as inline "Why we ask" toggles beside each field, not as bare namespace entries
the way §2.7's category labels were.

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
  solve). `freeTextElaboration` got a 5000-char cap at the validation boundary at the time — not in the
  Prisma column (unbounded `text`) or discussed when the schema was designed, added here as a standard
  public-input abuse guard. **The field itself was removed entirely later the same day — see §2.10.**
- **Gap surfaced, then closed 2026-08-20** (migration `20260820090000_cancer_course_unknown`):
  `CancerCourse` had no `UNKNOWN` member, so a reporter who didn't know whether progression was
  "unusually rapid" had no honest answer, and the field was left optional-even-when-`ONCOLOGIC` rather
  than forcing a guess. That worked but cost real signal: "declined to answer" and "actively does not
  know" both landed as `NULL` and could not be told apart in aggregation. `UNKNOWN` added (purely
  additive, one `ALTER TYPE`, existing `NULL`s deliberately left as `NULL` rather than rebranded), and
  `cancerCourse` consequently became **required-when-`ONCOLOGIC`**, matching `cancerType`/`NOT_YET_TYPED`
  exactly — the original reason for its optionality was the absence of an honest "don't know", and that
  reason is gone. **`cancerPresentationType` remains optional** for precisely the reason `cancerCourse`
  used to be: `NEW_DIAGNOSIS`/`RECURRENCE_OR_PROGRESSION`/`OTHER` has no "don't know" member (`OTHER` is
  an escape hatch, not an admission of not knowing). Closing that one needs its own decision about
  whether `OTHER` is already doing that job — not assumed away here either.
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

### Phase 4 — `ReportPlausibilityService` — attempted, then designed away, 2026-08-20
Originally planned as rule-based, deterministic contradiction-detection (not LLM-driven, matching BF's
`PatternDetectionService` precedent) — building it, then having it questioned, is what surfaced §2.9.
Built with two rules (`Report.flagReasons: PlausibilityFlagReason[]`, `ReportStatus.FLAGGED_IMPLAUSIBLE`,
`src/services/reportPlausibility.ts`, its own migration), then **removed in full within the same
session** once both rules turned out to be modeling smells rather than real signals — see §2.9 for the
complete reasoning. Net result: **no `ReportPlausibilityService` exists.** `reportIntake.ts` is back to
exactly its Phase 3 shape (always `PENDING_REVIEW`, no flagging step). What plausibility signal remains
is ordinary IP-based rate limiting (`generalLimiter`, already applied to all of `/api`) — not a
field-contradiction detector, because the two contradictions considered were fixed at the schema level
instead (§2.9). Phase 4 is complete as "there was nothing left to build here," not skipped.

While generating this phase's migrations, also hit and fixed (by cherry-picking, not reinventing) a
known standing gotcha unrelated to this feature: `evidence_embeddings` (a raw-SQL pgvector table with
no Prisma model) was about to get silently proposed for deletion by `migrate diff`, because this
branch's base predates `fix/gf-evidence-embeddings-schema-drift` (`2de874b`, merged elsewhere, not yet
on `master`). Applied that fix's `EvidenceEmbedding` model manually (cherry-pick itself was blocked by
uncommitted local changes) rather than letting the diff through — see the migration's own commit
message and `feedback-audit-trust-critical-callsites.md`-style diligence: always read what a generated
migration actually says before applying it, never trust "the tool said so."

### Phase 5 — Researcher moderation — redesigned, no queue, no status, 2026-08-20
Was "a review queue for a Researcher to move every report from PENDING_REVIEW to PUBLISHED" — see §2.10
for why that's the wrong shape given this model's own founding premise (volume as signal, not
individual verification) and doesn't scale to the thousands of reports this feature expects. No human
touches the vast majority of individual reports before they count toward the aggregate — and, per the
direct conclusion of that same review, `Report` no longer has a `status` field at all (§2.9/§2.10's
final state): a report counts the moment it's created, full stop.

What Phase 5 actually needs to build, once started:
- **Automated abuse defense** — already partially in place (verified email, `generalLimiter`); whether
  anything beyond ordinary rate limiting is needed (submission-pattern anomaly detection, say) is an
  open question for this phase, not assumed.
- **An exception path for confirmed spam/fraud — deletion, not a status transition.** With no `status`
  field, there's no `REJECTED_*` state to move a report into; a report confirmed spam/fraudulent gets
  deleted outright, the same real-removal principle already used for `delete_evidence`. What triggers
  a delete (an automated flag? a researcher's own judgment call on something surfaced some other way?)
  is this phase's actual design question — not yet decided.

### Phase 6 — Aggregation / pattern-detection layer ✅ DONE (backend) 2026-08-20
The actual point of this model (§0). User raised, before any code: this is a textbook BI/OLAP problem
("dimensions, filters, can a user play with it") and the risk of reinventing tooling that already
exists needed checking before building anything.

**Tooling decided**: no new BI service (Metabase/Superset ruled out — new infra/ops/staging-gate
burden, and self-hosted theming can't match GF's Hebrew-RTL design system without real work) and no
headless semantic layer (Cube.dev ruled out — still a new service to deploy/connect, unjustified given
this team's demonstrated pattern all session of not adding infrastructure without a proven need, e.g.
the reporter-verification-email vendor question in §2.8). Minimal custom, staying inside the stack
everything else in GF already lives in.

**Built**:
- **`src/lib/reportDimensions.ts`** — the actual security boundary. `$queryRaw`'s tagged-template
  parameterization is safe for values but can't parameterize identifiers (column names in `GROUP BY`),
  so every dynamic identifier in the service comes only from this file's fixed string literals, never
  from a request body. Deliberately a curated subset per domain (6 dimensions each — category,
  severity/basis-type fields, timing, demographics), not every column — oncology/cognitive sub-fields,
  `doseNumber`, `documentationAvailable`, `timingRelativeToEvent` deferred, not forgotten. Also holds
  `SUPPRESSION_THRESHOLD = 10`, NCHS/CDC WONDER's own public-health-statistics standard (adopted 2011,
  replacing an earlier 1-4 rule found insufficient) — not an invented number.
- **`src/services/reportPatternService.ts`** — `getMedicalPattern`/`getSocialEconomicPattern`, using
  Postgres's native `GROUP BY CUBE(...)` (not a plain `GROUP BY`) — CUBE returns every rollup level in
  one query (totals by each dimension alone and by their combination), which is what actually enables
  "play with it" drill-down without a network round-trip per view; using a lesser primitive here would
  have quietly reintroduced the "reinvent it by hand" problem one layer down. `GROUPING()` distinguishes
  a rolled-up dimension from a genuinely-null data value — tested explicitly, since conflating the two
  would silently corrupt results. Suppression is enforced here, server-side, before any row leaves the
  function — never left to the frontend.
- **`POST /api/reports/medical/aggregate`, `POST /api/reports/social-economic/aggregate`**
  (`reportRoutes.ts`) — public, no auth, same precedent as `GET /api/stats`: only ever returns
  suppressed aggregate counts, nothing about an individual report. Body: `{ dimensions: string[] (1-3),
  filters?: Record<dimension, string[]> }` — zod-validated against each domain's allowlist before ever
  reaching raw SQL (defense in depth; `reportDimensions.ts` is the real boundary, this is what turns an
  invalid dimension name into a clean 400 instead of a raw-SQL error).
- **30 new tests** across both files — the pattern-service tests inspect the actual generated SQL text
  (via `Prisma.sql`'s own `.text`/`.values`) rather than trusting it blindly, confirming filter values
  are genuinely parameterized (`$1`, `$2`) and not string-concatenated. Full suite 719/719, `tsc` clean.
- No migration — this phase only reads existing tables.

**Not done**: frontend rendering (charting library not chosen — load the `dataviz` skill when building
actual chart components, per its own trigger conditions; this is Phase 9's job, not Phase 6's).

### Phase 7 — Thesis citation wiring (open design question, not yet decided)
How does a thesis actually cite a report aggregate? `ThesisMention.type` today is a closed enum
(`KEY_FIGURE` / `EVIDENCE` / `TRACKED_URL`), each pointing at a real row by ID. A report aggregate isn't
a row — it's a computed query result ("347 reports of X in window Y"). Needs its own design pass before
implementation: likely a new `MentionType.REPORT_PATTERN` whose `refId` encodes a query descriptor
rather than a database ID, but that's a proposal, not a decision — flag for discussion when this phase
starts.

### Phase 8 — Frontend public intake form ✅ DONE 2026-08-20
Multi-step questionnaire at `src/app/[locale]/reports/new/page.tsx`, Hebrew-first RTL, plus a homepage
CTA (a third "Get Involved" door beside the whistleblower and researcher ones — nothing else on the
site points at `/reports/new`, so that card is the entire discovery path). §4's methodology and
per-question copy is now wired in and fully bilingual: §4.3's help text already had verified Hebrew,
§4.1/§4.2's prose was English-only and was translated this phase. New `reports` namespace in
`messages/{he,en}.json` (116 keys, key-for-key identical across locales).

**The verification-callback design — decided first, as the previous session's note required.**

The flow is **verify first, then answer**, and the form page is **its own magic-link callback**. Both
follow from one constraint that no amount of UI work removes: `verifyAndConsumeReporterEmail` deletes
the reporter's Supabase account the instant it verifies the token (§2.8), so verification is one-shot
and destructive, and a magic link is a full page navigation, so anything answered *before* clicking it
must survive that round trip somewhere.

Alternatives weighed and rejected, so this doesn't get re-litigated:

- **Answer first, stash the draft in `sessionStorage`/`localStorage`, restore and auto-submit on the
  callback page** (the previous session's provisional guess). Rejected: `sessionStorage` is empty in
  the new tab an email client opens, so it would have had to be `localStorage` — which means writing
  **health data (GDPR Art. 9)** to disk, unencrypted, with no submission yet justifying it, at exactly
  the moment the reporter has walked away to their inbox and might never come back. It also adds
  stale-draft expiry and restore-failure handling. Verifying first means there is nothing to persist:
  the only thing crossing the round trip is the token, and it arrives in the URL by construction.
- **Encode the answers in the `redirect_to` URL.** Rejected outright — that puts health data in an
  email body, in server logs, and in browser history.
- **Cross-tab handoff** (callback tab posts the token to the still-open form tab via `BroadcastChannel`
  or a `localStorage` event). Genuinely avoids persisting health data and keeps verify-last, but fails
  whenever the original tab was closed or evicted — and its only robust fallback is a persisted draft,
  i.e. the option already rejected.
- **Six-digit OTP instead of a link** (`{{ .Token }}` in the Supabase email template + `POST
  /auth/v1/verify`), which would need no navigation at all and would be the cleanest flow on paper.
  Rejected as undeliverable here, not as wrong: it requires editing the auth email template in the
  Supabase dashboard for two projects, which is config this session could neither make nor verify.
  **If reporter drop-off at the email step ever turns out to be a real measured problem, this is the
  option to reach for** — it removes the round trip entirely rather than working around it.
- **Reusing `/auth/callback`.** Rejected as the previous session predicted, and for a sharper reason
  than "it's built for Researcher login": it calls `AuthContext.login()`, which would establish a
  persistent session and **clobber a signed-in researcher's own session** if they ever filed a report.
  This flow never touches `AuthContext` at all — the token lives in component state, is used once, and
  dies with the page.

The cost of verify-first is honest friction at the door, which for this feature is arguably where it
belongs: the reporter is told what happens to their email (nothing is stored, the account is deleted,
and *therefore* we can never find their report again) **before** they type anything sensitive, rather
than after.

Mechanically: the page reads `access_token` from the URL fragment on mount and strips it via
`history.replaceState` before anything else runs, so a live token is never left in the address bar,
history, or anything the reporter might copy. Token expiry mid-flow (Supabase default 1h) surfaces as
a 401 on submit and is shown honestly — re-verify, and the answers must be entered again, because
nothing was saved anywhere. Steps: verify → domain → category → details → about → review+consent.

**Requires a Supabase config change before this works on any deployed environment**: the project's
Auth redirect allow-list must include `/{he,en}/reports/new` (or a wildcard). GoTrue silently falls
back to `SITE_URL` for a `redirect_to` it doesn't recognise, so a missing entry fails as "the link
works but lands on the homepage", not as an error. Not verifiable from this session.

**Two real defects found and fixed while building, both surfaced only by the frontend needing them:**

1. **Validation ran *after* the verification was consumed** (`requireVerifiedReporterEmail` was Express
   middleware, so it could only run before the handler). A submission the schema then rejected with a
   400 silently burned the reporter's single magic-link, forcing a whole new email round trip to fix
   one field. Fixed by turning the middleware into an awaited call —
   `verifyAndConsumeReporterEmail(req)` — that the route makes *after* `safeParse` succeeds. The
   middleware form is gone rather than left beside it, along with the now-purposeless
   `req.reporterVerified` flag; the ordering is asserted by a test that fails if verification is ever
   called on an invalid body. Same class of finding as §2.9: the fix belonged to the shape of the
   thing, not to a check bolted on afterwards.
2. **Nothing verified the frontend label catalogs against the real Prisma enums.** §2.7 checked parity
   once, by hand, which was enough while the JSON was only a lookup table. Phase 8 made the intake
   form derive its **option lists — the actual set and order of choices a reporter can pick** — from
   those same namespaces, so an enum member added to `schema.prisma` and forgotten in the JSON is now
   an outcome that silently cannot be reported. `backend/test/reportLabelParity.test.ts` (64 assertions)
   now enforces same-members/same-order/no-empty-or-untranslated across both locales. Schema
   declaration order is therefore the UI display order; reordering the form is a `schema.prisma` edit.

**Frontend conventions followed** (confirmed by the previous session's Explore pass, now acted on):
`[locale]`-prefixed App Router + next-intl, `useTranslations`, plain `useState` state machine (no form
library exists in this app), raw HTML + inline Tailwind (no shared `Button`/`Input` components exist),
`sendMagicLink` from `src/lib/supabase.ts` reused rather than rebuilt.

**`src/lib/reportEnums.ts` is the frontend's taxonomy source.** Types come from `import type` of
`en.json` (erased at build — the ~46KB catalog is never duplicated into a chunk); runtime option lists
come from the active locale's loaded messages. So the enums are never hand-copied across the
Express/Next.js boundary, and the parity test above is what makes reading them out of JSON safe rather
than merely convenient.

**Client-side mirror of the conditional-required rule**: `cancerType` when `ONCOLOGIC`,
`cognitiveSymptomType` when `NEUROCOGNITIVE_PVS`. The server remains the authority, but a reporter
should learn they skipped a required answer while it is still in front of them. Relatedly, the payload
is *derived from the selected category at send time* rather than by clearing state on every category
change — so a reporter who fills the cancer questions and then switches category cannot produce the
body the schema rejects. Same "make the invalid state unrepresentable" move as §2.9, one layer out.

**Verified**: backend 721/721 + 64 new parity assertions, `tsc` clean on both apps, `next build` clean
(the route appears in the manifest). Driven in a real browser against a running dev server: the
homepage CTA renders and links to `/he/reports/new`; the callback consumes a token from the fragment,
strips the URL, and advances the wizard; the ONCOLOGIC branch shows its conditional block; the review
step renders every answer with correct Hebrew labels. **Not verified end-to-end**: a real magic-link
send and a successful write — this machine could not reach the staging Supabase pooler or Auth
(`Can't reach database server`), and writing real rows to staging was out of scope for this session
anyway. The submit path was exercised as far as the network allowed. Note `tsc` in a fresh worktree
must be run via the app's own `node_modules/.bin/tsc` (6.0.3); `npx` resolves the repo root's 5.9.3,
which rejects this `tsconfig.json` outright and typechecks nothing.

**Still open, deliberately**: the epistemic-tier
distinction (§2.5) is currently carried in the methodology *prose* only — Phase 9 still owes it real
visual weight. Lint: this page adds one instance of `react-hooks/set-state-in-effect` for reading the
URL fragment on mount; the rule already fires in 8 files on `master` (19 errors there, 20 here) and is
not an enforced gate. The alternatives (`useSyncExternalStore` with a cached snapshot, or a lazy
`useState` initializer) either need a module-level mutable cache or produce a hydration mismatch, both
worse than the effect.

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

**Phase 9 (frontend aggregate display) is now the only substantial piece left in the main line.** Phase
8 shipped this session, so real report data can finally be generated; Phase 6's endpoints
(`POST /api/reports/{medical,social-economic}/aggregate`) are live, tested and suppression-enforced and
have been waiting for a renderer. Load the `dataviz` skill first, per its own trigger conditions — not
yet done — and pick a charting library. Phase 9 also carries the one requirement Phase 8 could only
half-discharge: the epistemic-tier distinction (§2.5, §2.3) is currently expressed in intake prose
only, and `defamation-risk.md` Rule 2 requires it to have real visual weight in any public display.

Before Phase 8 can actually work on staging or production, someone with Supabase dashboard access must
**add `/{he,en}/reports/new` to each project's Auth redirect allow-list** (or a wildcard). This is the
one blocking external dependency; a missing entry fails silently as "the magic link lands on the
homepage".

Phase 5 (automated abuse defense) remains deliberately deferred until real submission volume shows
whether it is needed at all. Phase 7 (thesis citation wiring) is still an open design question, not
started.

**Before anything else on this branch: apply and verify `20260820090000_cancer_course_unknown` against
staging.** It is the only migration in this feature that has not been query-verified against a real
database, purely because the machine that wrote it could not reach the pooler. Verify it the same way
every other one here was — a direct query that genuinely errors if the value is absent, not
`migrate deploy`'s own success message.
