# Project "Bronze Fortress" — מבצר הנחושת — Platform Strategy

> A companion platform to Glass Fortress, for a fundamentally different problem.

---

## What This Is

A platform for parents abused by the Israeli family court and welfare system (משרד הרווחה + בית משפט לענייני משפחה). Cases are legally sealed — parties hold their own documents but cannot publish them publicly.

**The goal:** prove systemic corruption through patterns across independently sealed cases, without exposing any individual case.

**The insight that makes it possible:** you don't need to show any individual case to prove systemic corruption. You need to show that across N independently sealed cases, the same procedural violations, the same welfare workers, the same judicial behaviors appear. The *pattern* is the legal argument. Individual cases are evidence of the pattern, not the public artifact.

---

## Why This Is Not Glass Fortress

| Aspect | Glass Fortress | Bronze Fortress |
|---|---|---|
| Default visibility | Public | Private (encrypted) |
| Who contributes | Whistleblowers (institutional leaks) | Victims (their own sealed docs) |
| What gets published | Evidence + thesis | Pattern analysis only |
| Redaction | Optional | Mandatory pipeline |
| Proof surface | The document | Hash + statistical pattern |
| Core question | "What can we prove publicly?" | "What can we prove without exposing anything?" |

The privacy model is foundational — it propagates through every layer: database schema, API design, vector store, frontend, threat model. It cannot be retrofitted onto a public-first architecture. These must be separate applications.

**Analogy:** SecureDrop vs. a newspaper CMS. Same conceptual domain, incompatible architectures.

---

## Relationship to Glass Fortress Codebase

**Not a fork. Not a copy. A shared protocol.**

```
openjustice/                    ← monorepo root
  packages/
    core/                       ← extracted from Glass Fortress
    ui/                         ← Hebrew RTL components, design system
  apps/
    glass-fortress/             ← current platform, unchanged
    bronze-fortress/               ← this platform
  contracts/                    ← shared: EvidenceRegistry.sol
```

Separate deployments. Separate databases. Separate encryption keys. Monorepo only for code sharing.

### What Glass Fortress Gives Us (~40% of Bronze Fortress)

- **Thesis engine** — thesis → gap → AI critique → revision loop (pattern theses work identically)
- **MCP tool framework** — auth middleware, tool registration, researcher workflow
- **On-chain registrar** — Web3Service, EvidenceRegistry.sol
- **Agent abstractions** — DevilsAdvocate, Synthesis, FOIA agents (same structure, parameterized system prompts)
- **Evidence intake pipeline** — IntakeAgent + Zod validation
- **i18n / RTL** — Hebrew-first Next.js patterns

### What Bronze Fortress Builds Fresh (the other 60%)

These must be built first. They cannot be retrofitted.

---

## Core Architecture: Privacy-First

### 1. Encryption-First Storage

Every family gets an encrypted namespace. Content is encrypted **client-side** before upload. The server holds ciphertext and metadata only — the database admin cannot read content. This is non-negotiable.

### 2. Consent Management

Each family controls exactly what they share and at what tier. Consent is explicit, per-sharing-level, and revocable. Exit rights: a family can withdraw; their hash stays on-chain (immutable proof of existence), their content is deleted.

### 3. The Pattern Thesis (New Concept)

In Glass Fortress, a thesis is supported by evidence content.
In Bronze Fortress, a thesis is supported by **cryptographic commitments** from independent families:

```
Family A registers: hash(caseId + judgeId + "welfare_referral_delay" + date)
Family B registers: hash(caseId + judgeId + "welfare_referral_delay" + date)
... 34 families register independently.
```

Nobody sees another family's content. The blockchain proves 34 families independently committed to the same pattern + judge combination. That is the legal argument.

### 4. Mandatory Redaction Pipeline

AI-assisted redaction + mandatory human review gate before anything enters even the pattern layer. No content is ever published without this step.

### 5. Tiered Access Model

| Tier | Who | What they see |
|---|---|---|
| 0 — Public | Anyone | Patterns, statistics, thesis |
| 1 — Legal team | Lawyers (gated) | Redacted summaries, no names |
| 2 — Judicial/subpoena | Court-ordered only | Specific case docs, audited |

---

## Blockchain Role (Stronger Here Than Glass Fortress)

A family registers their document hash + a commitment (judge ID + pattern category — no names) *before* coordinating with anyone else. Later, you prove: 34 families independently registered commitments pointing to the same judge and the same procedural pattern. No coordination required. No content shared. This is cryptographic proof of a pattern — impossible to dismiss as fabricated or coordinated.

---

## Family Cooperation — Bringing Families Together Without Exposing Them

### The Psychological Starting Point

Many families are gaslit. They've been told their case is unique, the judge is fair, the welfare worker followed procedure. The single most powerful thing the platform can do — before any cooperation feature — is tell a family:

> "You are not alone. 23 other families registered concerns about this person."

No names. No details. Just the number. This breaks the isolation the closed-door system depends on.

### The Matching Problem: Private Set Intersection

How does Family A find Family B without either revealing their case? Each family registers a **structured commitment** — not case content, but a hashed key:

```
hash(judgeId + patternCategory + quarterYear)
```

The platform sees: "34 families committed to this judge + welfare_referral_at_first_hearing + Q1-2022." Nobody sees who those families are. The platform says "you match" without knowing what it matched on. Families then choose whether to act on that signal.

### The Cooperation Toolkit — Graduated Trust

Not all families want the same level of exposure. The platform offers a spectrum, each requiring explicit opt-in:

| Level | Name | What happens |
|---|---|---|
| 1 | You Are Not Alone | Family sees count of others with same pattern + key figure. No interaction required from others. |
| 2 | Anonymous Timeline Comparison | Opt-in: share a fuzzed anonymized timeline (quarter/year, event categories only). See others' timelines without knowing whose they are. |
| 3 | Anonymous Messaging | Opt-in: platform routes messages between families without revealing identities. Both parties must have opted in. |
| 4 | Mutual Introduction | Both parties explicitly consent. Platform facilitates handshake. Real contact details exchanged. Platform steps back. |
| 5 | Shared Evidence Room | Private encrypted workspace for a group. Document sharing, shared timeline building, co-authored pattern report. Nothing goes to the public pattern layer without unanimous group consent. |

### Structured Intake as the Discovery Engine

Discovery works best when families describe their experience in **structured terms**, not free text. Free text is reidentifying and unqueryable. Structured answers are aggregatable and privacy-preserving.

Intake questionnaire uses dropdowns and yes/no, never freeform text for key facts:
- Which court? (dropdown)
- Judge name/ID? (from a known list)
- Social worker / organization? (from a list)
- Did welfare referral happen at the first hearing? (yes/no)
- Were children removed without prior written notice? (yes/no)
- Was a hearing delayed more than 30 days without explanation? (yes/no)
- Timeline markers: quarter/year only, not exact dates

A family might not know that "referral at first hearing" is unusual. The intake questions reveal which patterns exist — the questionnaire itself educates families about what to look for.

### The Key Figure Profile Page

Each judge and social worker accumulates a semi-public profile — visible to registered families, not the open internet:

- Name / official ID (official capacity only)
- Count of families who registered concerns
- Pattern categories present ("welfare_referral_at_first_hearing: 18 cases" — no case details)
- Whether there is an active legal effort
- A "join this effort" button

This is the bridge between the private vault and the legal strategy layer. A family reads the profile and thinks: "18 other families experienced the same thing. There's an active case." They don't need to know who those 18 families are to decide to join.

### The Lawyer as Trust Anchor

A lawyer with 3 clients facing the same judge can vouch for a connection inside the platform. The lawyer becomes a trusted introducer, collapsing the graduated trust ladder from Level 1 straight to Level 4 or 5. This also provides professional privilege framing — the cooperation looks like legal coordination, not witness coaching.

### The "Completed Case" Problem

Families who finished their cases years ago — lost, moved on — are the most valuable pattern witnesses (complete case arcs). They won't find the platform organically. The platform needs a dedicated "I lost but I want my case to count" entry point: lightweight intake (structured commitment only), no ongoing engagement required. Their case contributes to the pattern even if they never log in again.

### Critical Legal Risk: Coordination vs. Fabrication

Opposing lawyers will argue families coordinated to fabricate. Mitigation by design:

- Families compare **structural facts** (dates, procedural categories) — never testimony
- The platform never facilitates "what to say in court"
- Each family's on-chain hash is timestamped **before** any connection is made — proving independence
- The pattern thesis explicitly states: "these commitments were registered independently before families were connected"

The independence proof is what makes the blockchain commitment legally powerful. The timestamp precedes the cooperation. You cannot seal what was never written down as words.

---

## Key Figures — Social Workers and מאבחנים

### The Real Power Structure

Judges are often חותמת גומי (rubber stamps) on recommendations made by social workers (עובדי סוציאליים) and court evaluators (מאבחנים — psychologists, psychiatrists). The actual misconduct lives at that layer, not at the judicial level. A platform that only tracks judges is tracking the wrong layer.

### Why These Figures Are Harder to Register

Judges have public registries. Social workers and מאבחנים do not — they are state employees or court-contracted professionals acting in an official capacity, but not in any downloadable public database.

However: **every family already has their name** — in their own sealed case file, which they have the legal right to access. The social worker's name appears in the welfare report (תסקיר). The מאבחן's name and credentials appear on the evaluation (חוות דעת). These are official documents issued to the family as a party to the case.

### Community-Built Registry With Verification Gates

**Phase 1 — Family proposes a key figure**
During intake, if no matching figure exists, a family proposes:
- Name as it appears in their official case documents
- Role: social worker / מאבחן / guardian ad litem (אפוטרופוס לדין) / etc.
- Organization or employer
- Optionally: a redacted excerpt from their own file showing the name in official context

The proposal enters a pending queue — invisible, uncounted, not yet a key figure.

**Phase 2 — Activation threshold**
A figure only becomes active when **N independent families (minimum 3)** name the same person in the same official role. Before that threshold: nothing shown, nothing committed on-chain, nothing queryable.

This is the primary defamation guard. One angry family naming someone is noise. Three independent families naming the same person in the same official capacity is a signal that cannot be dismissed as malicious.

**Phase 3 — Cross-reference with public professional registries**
Israel has partial registries:
- Licensed psychologists: Ministry of Health פנקס הפסיכולוגים (public)
- Social workers: מרשם העובדים הסוציאליים (partially accessible)
- Court-approved evaluator lists: some courts maintain מאבחן approval lists — obtainable via FOIA

A registry match adds a "verified licensed professional" flag. No match doesn't block activation — it's noted as "unlisted."

**Phase 4 — Legal review gate**
Before a figure becomes fully active (visible in key figure profile, included in pattern counts), a legal reviewer approves. Same human gate as Glass Fortress call page review.

**Phase 5 — FOIA as a seeding tool**
Generate FOIA requests to family courts requesting official lists of approved מאבחנים and appointed social workers for a given period. Names received via FOIA enter the registry officially — sourced from the institution itself, not from families. The cleanest possible sourcing.

### Distinguishing Types of מאבחנים

| Type | Status | Registry threshold |
|---|---|---|
| Court-appointed from approved list (ממונה על ידי בית המשפט) | Officer of the court | Standard (3 families) |
| Ministry employee conducting evaluations | Public employee | Standard (3 families) |
| Private professional hired by one party | Private contractor | Higher threshold (5 families) + mandatory legal review |

Only court-appointed and ministry-employed מאבחנים belong in the registry by default.

### What the Platform Says About Them

Acting in official capacity — not as private individuals — the platform can name them carefully:

> "Social worker at Givataim District Welfare Office, named in official documents in 17 independently registered cases."

Never: "social worker who abused families." The count is the statement. The pattern categories are the statement. Official capacity is the key that unlocks naming — same legal frame Glass Fortress uses for ministry officials.

### The Most Powerful Pattern Thesis This Unlocks

Once מאבחנים are in the registry, you can build arguments no individual family could construct alone. But the framing matters critically.

**What the platform CANNOT claim — selection bias:**
The platform is a complaint registry, not a census. Every case in it is a case where a family felt wronged. Cases where the same מאבחן acted correctly are invisible. "מאבחן X recommended removal in 28 of 31 cases" sounds like a rate — but it's a rate over complainants only, not over total caseload. An opposing lawyer destroys this in one sentence: *"Of course all your cases show misconduct — you only registered misconduct cases."*

**What the platform CAN claim — process signatures:**
The argument is not outcome rates. It is procedural fingerprints:

> "24 families who never met each other independently registered the identical procedural pattern: single session under 90 minutes, primary parent not interviewed separately. Each registration was timestamped on-chain prior to any family being connected to another."

This is legally bulletproof. It makes no rate claim. It asserts only what the platform can prove: independent, timestamped, convergent descriptions of the same behavior. The procedure either happened or it didn't. If the procedure violates professional standards (האיגוד הישראלי לפסיכולוגיה, etc.) — that comparison is the argument.

**To get outcome rates legitimately — use FOIA:**
1. Platform has N registered cases involving מאבחן X
2. FOIA to the court: "How many evaluations did this appointed evaluator conduct between [date range]?"
3. Response provides total caseload — the legitimate denominator
4. Now complaint counts are contextualized against a real population

The FoiaLetterAgent handles this directly. The platform doesn't claim the rate — it generates the request to obtain data that makes the rate legitimate.

---

## Intake Questionnaire Design

The questions must simultaneously educate (reveal what patterns look like), aggregate (machine-comparable across families), and protect (no freeform text for key facts, no exact dates in public layer).

### Date Handling
**Store real dates in the private encrypted vault.** Real dates enable correlation with external events (new judge assignment, ministry directive, welfare office management change) and precise legal timelines. For on-chain commitments and public pattern display, show quarter + year only. Best of both worlds — full precision retained privately, fuzzed publicly.

### Section A — Case Type & Period
- Type of proceeding: `divorce/custody` / `child protection` / `both` / `other`
- Which family court: dropdown of Israeli family courts by city
- Approximate period: quarter + year (Q1–Q4 + year) for public layer; real dates stored encrypted
- Case status: `ongoing` / `concluded`

### Section B — Key Figures
For each role, family selects from registry or proposes a new figure (name + role + organization as it appears in their official documents):
- **Judge** — from court registry (public)
- **Social worker** — from registry or propose (name from their תסקיר)
- **Evaluator (מאבחן)** — from registry or propose (name + license type from their חוות דעת)
- **Guardian ad litem (אפוטרופוס לדין)** — from registry or propose

### Section C — Criminal Allegations (Domain A)
- Was a police complaint filed against you by the other party? (yes/no)
- Was the case closed? (yes/no/pending)
- If closed — reason: lack of evidence / actively cleared / statute of limitations / other
- Did the family court consider the closure in its ruling? (yes/no/unknown)
- After closure, did your custody/access: worsen / stay the same / improve
- Did the welfare report cite the complaint despite the closure? (yes/no/unknown)

### Section D — Welfare Report (תסקיר) Patterns
| Question | Options |
|---|---|
| Was a welfare referral made? | Yes / No |
| At what stage? | At or before first hearing / Within first month / Later |
| Did the welfare worker visit your home? | Yes / No |
| Were both parents interviewed? | Yes, equally / Only primary parent / Only other parent / Neither |
| Time from referral to final report | Under 2 weeks / 2–4 weeks / 1–3 months / Over 3 months |
| Did the recommendation change between draft and final without explanation? | Yes / No / Unknown |
| Were you given the draft to respond to before court submission? | Yes / No |
| Did the report cite allegations that were later dropped/disproven? | Yes / No / Unknown |
| Final recommendation | Custody maintained / Supervised visits / Child removal / Other |

### Section E — צו נזקקות / Evidentiary Hearing (חוק הנוער violations)
| Question | Options |
|---|---|
| Was a צו נזקקות issued? | Yes / No |
| Type | Standard order / Emergency order (צו חירום) |
| Was a full evidentiary hearing (דיון הוכחות) held before the order? | Yes / No |
| If emergency order: how long until a full hearing? | Under 30 days / 30–90 days / Over 90 days / Never held |
| Where were the children during this period? | With other parent / Foster family / Institution |
| Total duration of child separation without a merits hearing | Under 30 days / 30–90 days / 3–12 months / Over 1 year |

### Section F — Evaluation (מאבחן) Patterns
| Question | Options |
|---|---|
| Was a psychological/psychiatric evaluation ordered? | Yes / No |
| Ordered by | Court-appointed / One party requested / Agreed by both |
| Number of sessions | 1 / 2–3 / More than 3 |
| Total evaluation time (all sessions) | Under 90 min / 90 min–3 hrs / Over 3 hrs |
| Was the primary caregiver interviewed separately? | Yes / No |
| Were both parents evaluated? | Yes / Only primary / Only other / Neither |
| Were children evaluated? | Yes / No |
| Was a feedback session held with parents? | Yes / No |
| Did the judge follow the evaluation without independent analysis? | Always / Usually / Sometimes / Rarely |

### Section G — Guardian Ad Litem (אפוטרופוס לדין)
- Was a guardian appointed? (yes/no)
- Did the guardian meet with the child? (yes, multiple times / yes, once / no)
- Did the guardian's recommendation align with the child's expressed wishes? (yes/no/child didn't express / unknown)
- Was this guardian previously appointed by the same judge in other cases you're aware of? (yes/no/unknown)

### Section H — Court Process
| Question | Options |
|---|---|
| Were hearings repeatedly delayed without explanation? | Yes / No |
| Typical delay | Under 30 days / 30–90 days / Over 90 days |
| Were emergency orders issued without prior notice to you? | Yes / No |
| How many judges presided over your case? | 1 / 2 / 3 or more |
| Were your lawyer's arguments addressed in written rulings? | Yes / Partially / No |
| Was a hearing ever conducted without you or your lawyer present? | Yes / No |
| Was a recusal request denied? | Yes / No / Never filed |

### Section I — Documents Held
For each: תסקיר / חוות דעת / court rulings / police closure letter
- Do you hold it? (yes/no)
- Willing to share encrypted with legal team? (yes/no/selective)

---

## Pattern Category Taxonomy

These are the `patternCategory` values used in commitment hashes and pattern theses. Organized by legal domain.

### Domain A — Criminal-to-Family Interface
| ID | Hebrew | What it captures |
|---|---|---|
| `criminal_exoneration_ignored` | זיכוי פלילי שנתעלם ממנו | Police closed case; family court/welfare still treated accusation as credible |

### Domain B — חוק הנוער Procedural Violations
| ID | Hebrew | What it captures |
|---|---|---|
| `emergency_order_no_hearing_30_days` | צו חירום מעל 30 יום ללא דיון | Emergency order extended beyond 30-day legal limit |
| `nzakut_no_evidentiary_hearing` | צו נזקקות ללא דיון הוכחות | Nzakut order maintained without proper evidentiary hearing |
| `child_removed_over_year_no_hearing` | הרחקת ילד מעל שנה ללא דיון | Child separated from parent over 1 year without merits hearing |

### Domain C — Welfare Professional Violations
| ID | Hebrew | What it captures |
|---|---|---|
| `welfare_referral_at_first_hearing` | הפניה לרווחה בדיון הראשון | Referral at or before first hearing |
| `welfare_report_one_sided_interview` | תסקיר עם ראיון הורה אחד בלבד | Only one parent interviewed for welfare report |
| `welfare_report_no_home_visit` | תסקיר ללא ביקור בית | Welfare report filed without home visit |
| `welfare_report_cites_dropped_allegations` | תסקיר המסתמך על אישומים שנסגרו | Report cites allegations that were later dropped or disproven |
| `welfare_recommendation_changed_unexplained` | שינוי המלצה ללא הסבר | Recommendation changed between draft and final without documented reason |

### Domain D — Evaluator Violations
| ID | Hebrew | What it captures |
|---|---|---|
| `evaluator_single_session_under_90_min` | הערכה בפגישה אחת מתחת ל-90 דקות | Single session under 90 minutes total |
| `evaluator_single_parent_only` | הערכה של הורה אחד בלבד | Only one parent evaluated |
| `evaluator_no_feedback_session` | ללא פגישת משוב | No feedback session held with parents |
| `judge_rubber_stamps_evaluator` | שופט חותמת גומי על המאבחן | Judge consistently follows evaluator without independent analysis |

### Domain E — Guardian Ad Litem
| ID | Hebrew | What it captures |
|---|---|---|
| `guardian_minimal_child_contact` | אפוטרופוס עם מגע מינימלי עם הילד | Guardian met child once or not at all |
| `guardian_repeatedly_by_same_judge` | אפוטרופוס חוזר של אותו שופט | Same guardian repeatedly appointed by same judge |
| `guardian_contradicts_child_wishes` | אפוטרופוס בניגוד לרצון הילד | Recommendation contradicts child's expressed wishes |

### Domain F — Judicial Conduct
| ID | Hebrew | What it captures |
|---|---|---|
| `ex_parte_hearing` | דיון ללא נוכחות צד אחד | Hearing conducted without one party or their lawyer |
| `recusal_denied_conflict` | סירוב פסילה למרות ניגוד עניינים | Recusal denied despite documented conflict of interest |
| `systemic_hearing_delays` | דחיות דיונים שיטתיות | Multiple hearings delayed 30+ days without explanation |
| `multiple_judge_handoffs` | העברת תיק בין שופטים מרובים | Case transferred between 3 or more judges |

### Domain G — ניכור הורי (Parental Alienation)
| ID | Hebrew | What it captures |
|---|---|---|
| `alienation_child_wishes_as_ruling_basis` | ניכור — רצון הילד כבסיס לפסיקה | Court relied on child's expressed wishes without investigating alienation |
| `alienation_raised_ignored` | ניכור הורי שנטען והתעלמו ממנו | Alienation raised in proceedings, not investigated |
| `evaluator_no_alienation_assessment` | מאבחן לא בדק ניכור הורי | Evaluator conducted assessment without screening for alienation indicators |
| `connected_parent_system_ties` | קשר בין הורה מנכר לאנשי מקצוע | Alienating parent has undisclosed ties to professionals in the case |
| `separation_window_used_for_alienation` | חלון הפרדה ששימש לניכור | Court-ordered separation period used to conduct alienation campaign |

---

## ניכור הורי — Parental Alienation as a System Pattern

### The Mechanism

ניכור הורי in the context of a corrupt system is not just one parent behaving badly. It is a structured, multi-stage operation that weaponizes the system's own processes:

**Stage 1 — Create separation.** Often triggered by a false or exaggerated abuse allegation (Domain A). An emergency order, a welfare referral, removal. The alienating parent now has physical access to the children without the other parent present.

**Stage 2 — Use the separation window.** During court-ordered separation — which can last months or years — the children are subjected to sustained psychological influence: coaching, framing the other parent as dangerous, rewarding rejection. This is where the alienation campaign happens.

**Stage 3 — The child "chooses."** By the time the case reaches a meaningful hearing, the child appears to spontaneously reject the other parent. Statements sound adult, scripted. The child refuses contact. It looks like autonomous preference.

**Stage 4 — The system ratifies it.** The court invokes "טובת הילד." The evaluator — who may have a prior undisclosed relationship with the alienating parent and conducts a single session under 90 minutes — confirms the child's wishes. The judge formally cuts contact. The isolation becomes court-ordered and legally enforced.

**Stage 5 — The loop closes.** Court-enforced separation deepens the alienation. The child now genuinely does not know the other parent. Every petition to restore contact is met with "the child doesn't want it." The alienation is self-sustaining and court-protected.

### Why "Connected to the System" Is the Key Variable

This is what separates systematic corruption from ordinary parental conflict. The evaluator has a prior relationship with the alienating parent — undisclosed. The welfare worker is a regular collaborator in the same professional network. The guardian is repeatedly appointed by the same judge. The alienating parent knows how to frame their narrative in the language these professionals respond to.

The connection may be explicit (they know each other personally) or structural (same professional community, same ideological framework, repeat appointments). Either way, the supposed neutral professionals are not neutral.

### The Epistemic Trap

A court sees: child refuses contact → child was probably harmed → court must protect child.

What actually happened: separation created → window used for alienation → child now refuses contact → court uses refusal to justify continued separation.

Cause and effect are reversed in the court's frame. Without longitudinal documentation — evidence of what the child said and felt *before* the alienation campaign began — the fabricated reality is the only reality visible to the court.

**This is why early registration matters.** Families should register and begin documenting before proceedings reach crisis point. A timestamped record of a child's changing statements over time, on-chain before any court hearing, is far more powerful than a retrospective claim of manipulation. The timestamp precedes the alienation — that is the proof.

### ניכור הורי as a Meta-Pattern

ניכור הורי is not a separate domain — it is an **organizing strategy** that runs across and weaponizes all other domains. It uses Domain A (false allegations) to create the separation window, Domain B (emergency orders without hearings) to extend it, Domain D (biased evaluators) to ratify it, and Domain F (rubber-stamp judges) to enforce it.

The platform's unique power: courts see one child's refusal. They cannot see that the same evaluator appeared in 34 cases — and in 29 of them failed to screen for alienation, and in 26 the connected parent "won." That pattern is only visible when independent commitments are aggregated across families.

### Intake Questions for ניכור הורי (Section J)

**About the other parent's connections:**
- Does the other parent have professional or personal connections to welfare workers, evaluators, or court-appointed figures in your case? (yes / no / unknown)
- Did any professional in your case have a prior relationship with the other parent that was not disclosed? (yes / no / unknown)

**About the children's expressed wishes:**
- Did the children's expressed attitude toward you change significantly after a period of separation? (yes / no)
- Did the children's statements sound coached or use adult framing? (yes / no)
- Did the court rely primarily on the children's expressed wishes to restrict your access? (yes / no)
- When did significant change in children's attitude begin? (before any proceedings / after first hearing / after first separation order / gradually over time)

**About whether alienation was raised:**
- Did you or your lawyer raise parental alienation in the proceedings? (yes / no)
- If yes — how was it addressed? (ignored / dismissed without investigation / investigated / accepted)
- Was an alienation-specific evaluation ordered? (yes / no)
- Did the evaluator screen for alienation indicators? (yes / no / unknown)

### New Pattern Categories (Domain G — ניכור הורי)

| ID | Hebrew | What it captures |
|---|---|---|
| `alienation_child_wishes_as_ruling_basis` | ניכור — רצון הילד כבסיס לפסיקה | Court relied primarily on child's expressed wishes without investigating alienation |
| `alienation_raised_ignored` | ניכור הורי שנטען והתעלמו ממנו | Alienation raised in proceedings, court did not investigate |
| `evaluator_no_alienation_assessment` | מאבחן לא בדק ניכור הורי | Evaluator conducted assessment without screening for alienation indicators |
| `connected_parent_system_ties` | קשר בין הורה מנכר לאנשי מקצוע | Alienating parent has undisclosed ties to professionals in the case |
| `separation_window_used_for_alienation` | חלון הפרדה ששימש לניכור | Court-ordered separation period was used to conduct the alienation campaign |

### What the Platform Can and Cannot Claim

The platform documents process signatures, not diagnoses.

**Can claim:** "In N independently registered cases involving evaluator X, families documented: single session under 90 minutes, no alienation screening, child's stated wishes used as primary basis for ruling."

**Cannot claim:** "Evaluator X enables parental alienation." That is a conclusion requiring expert testimony.

The pattern data creates the grounds for a proper legal investigation. The platform is the discovery mechanism, not the verdict.

---

## Revised Commitment Hash Design

**Quarter/year is NOT in the commitment hash.** Including time fragments the count — instead of "47 families reported this pattern," you get fragmented quarterly counts that look weaker. Time is stored separately and used in the pattern thesis as context (persistence over time), not as a filter.

```
hash(keyFigureId + "|" + patternCategory + "|" + courtId)
```

**courtId** is included because a social worker or evaluator may operate across multiple courts. Including the court adds specificity without reidentification risk.

A single family intake produces **multiple commitments** — one per key figure × pattern combination observed. A family with both a bad evaluator and a bad welfare worker registers two independent commitment chains.

**Threshold rules:**
| Situation | Activation threshold |
|---|---|
| Judge or court-appointed evaluator | 3 families |
| Ministry social worker | 3 families |
| Private contractor (hired by one party) | 5 families |
| Organization-level only (no named individual) | 2 families |

---

## Legal Framework (חוק הנוער)

The platform's AI agents and pattern thesis engine must be trained on these specific legal provisions. Pattern detection is only powerful when it maps to specific legal violations — not just "bad outcomes."

### חוק הנוער (טיפול והשגחה), תש"ך-1960
Key provisions:
- **Section 3** — conditions under which a child may be declared נזקק
- **Section 4** — emergency orders: conditions + **30-day strict limit** before full hearing required
- **Section 7** — evidentiary hearing requirements before standard נזקק declaration
- **Section 11** — appeals process and timeline

### What Makes a Pattern Legally Actionable
The difference between "bad judgment" and "illegal procedure":
- Emergency order maintained beyond 30 days without a merits hearing → **violation of section 4, specific and provable**
- Welfare report filed without interviewing both parents → **violation of professional conduct regulations**
- Judge ruling without addressing lawyer's arguments → **procedural violation, appealable**

The platform's pattern thesis does not say "these outcomes were unjust." It says "these procedures violated specific provisions of Israeli law, and N families independently documented the same violations by the same figures."

That is a legal argument, not a complaint.

---

## Critical Risks

### Reidentification
Even well-redacted case timelines can reidentify families in small communities. "Family with 2 kids, divorce filed March 2021, referral to Givataim welfare office" may be unique. Requires deliberate timeline fuzzing or differential privacy before any public release.

### Infrastructure Isolation
Bronze Fortress must be completely separate from Glass Fortress — different Railway service, different Supabase project, different keys, different domain. No shared infrastructure at any layer. No single person holds decryption keys for all families.

### Legal Boundary
Each parent holds documents about their own case — they are a party to the proceeding. In Israeli law, a party's right to their own case file differs from publishing it publicly. Family court confidentiality (סעיף 68 לחוק בתי המשפט) covers *content*, not necessarily *patterns*. Legal review required before any public launch.

---

## Build Order

**Phase 0 — Extract `packages/core` from Glass Fortress**
Refactor only. Glass Fortress imports from it, nothing breaks. This creates the shared foundation.

**Phase 1 — Bronze Fortress foundation**
Encryption architecture + consent management + family vault model. Build these before any feature work.

**Phase 2 — Pattern layer**
Cryptographic commitment scheme. Pattern thesis concept. Aggregation rules with privacy guarantees.

**Phase 3 — Features**
Thesis engine, MCP tools, FOIA generation, agent integrations. Fast to build because the hard parts are shared from `packages/core`.

---

## Strategic Vision

What this platform represents is a **class action discovery platform for sealed proceedings** — something that doesn't exist anywhere. The reason systemic corruption in family courts persists is precisely because the sealing prevents pattern recognition.

Glass Fortress and Bronze Fortress are complementary arguments for the same thesis:

> **Closed systems enable abuse. The remedy is structured, privacy-preserving transparency.**

If done right — real legal cover, real cryptographic guarantees, real redaction — this matters well beyond Israel.
