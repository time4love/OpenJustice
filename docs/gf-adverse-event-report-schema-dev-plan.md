# GF Public Adverse-Outcome Self-Reports — Dev Plan

**Status:** Phase 0 (schema draft) ✅ DONE — committed `4f99c9e` on branch
`schema/gf-adverse-effect-reports` (pushed, no PR yet). **Phase 1 (migration) ✅ DONE and applied to
staging 2026-08-20** — see §5. Phase 2's verification-mechanism decision made (Supabase magic-link
email); zod validation schemas not yet written. No backend routes/MCP tools/frontend code yet. See §5-6
for the full phase breakdown and current recommended next step. This document is the canonical
reference for the taxonomy's rationale; keep it in sync with `schema.prisma` as the design evolves.
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

### Phase 2 — Reporter identity & intake validation (design-heavy, blocks Phase 3)
- **Verification mechanism for `reporterFingerprintHash`: DECIDED 2026-08-20 — Supabase magic-link
  email**, reusing GF's existing Supabase auth infra (already used for `Researcher` login). Zero new
  vendor cost, no SMS/OTP billing. Still to design: the actual fingerprint formula (hash of verified
  email + what device/session signal, if any), and whether the email itself is retained post-verification
  or discarded (see Phase 10's open privacy question — related but not identical, since that's about
  storage of the *reporter's* contact, this is about the *hash's* inputs).
- **zod schemas for both domain payloads**, encoding the conditional-field rules the DB can't enforce
  (`cancer*` fields only when `symptomCategory = ONCOLOGIC`, `cognitive*`/`postExertionalMalaise` only
  when `NEUROCOGNITIVE_PVS`) — matches the project's standing rule (zod validation at every external
  input boundary) and the schema's own "validated at the intake boundary" comments.

### Phase 3 — Public intake API
`POST /api/reports/medical`, `POST /api/reports/social-economic` (no researcher gate — mirrors the
already-shipped blocked-URL evidence recovery pattern: open submission, always `PENDING_REVIEW`).
Each request: verify contact (Phase 2) → compute fingerprint → zod-validate → create the domain row +
`Report` envelope in one transaction. Depends on Phase 1 (migration must exist) and Phase 2 (verification
+ validation must be decided).

### Phase 4 — `ReportPlausibilityService`
Rule-based, deterministic — not LLM-driven, matching BF's `PatternDetectionService` precedent rather
than trusting a model's judgment on fraud signals. Two responsibilities: velocity/dedup checks against
`reporterFingerprintHash`, and internal-consistency rules (e.g. `seriousness = DEATH` with
`medicalAttentionSought = false` is a plausibility flag, not an auto-reject). Sets
`ReportStatus.FLAGGED_IMPLAUSIBLE` vs. leaving `PENDING_REVIEW`. Depends on Phase 3 existing to flag
against.

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

Phase 1 is done and verified on staging (§5). **Phase 2 is next**: the verification-mechanism decision
is made (Supabase magic-link email), so what remains is (a) defining the exact
`reporterFingerprintHash` formula and (b) writing the zod schemas for both domain payloads, including
the conditional-field rules (`cancer*` fields gated on `ONCOLOGIC`, `cognitive*` fields gated on
`NEUROCOGNITIVE_PVS`) that the database can't enforce on its own. That unblocks Phase 3, the first
actual backend endpoint.
