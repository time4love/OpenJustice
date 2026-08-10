# Project "Closed Doors" — Platform Strategy

> "בדלתיים סגורות" — a companion platform to Glass Fortress, for a fundamentally different problem.

---

## What This Is

A platform for parents abused by the Israeli family court and welfare system (משרד הרווחה + בית משפט לענייני משפחה). Cases are legally sealed — parties hold their own documents but cannot publish them publicly.

**The goal:** prove systemic corruption through patterns across independently sealed cases, without exposing any individual case.

**The insight that makes it possible:** you don't need to show any individual case to prove systemic corruption. You need to show that across N independently sealed cases, the same procedural violations, the same welfare workers, the same judicial behaviors appear. The *pattern* is the legal argument. Individual cases are evidence of the pattern, not the public artifact.

---

## Why This Is Not Glass Fortress

| Aspect | Glass Fortress | Closed Doors |
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
    closed-doors/               ← this platform
  contracts/                    ← shared: EvidenceRegistry.sol
```

Separate deployments. Separate databases. Separate encryption keys. Monorepo only for code sharing.

### What Glass Fortress Gives Us (~40% of Closed Doors)

- **Thesis engine** — thesis → gap → AI critique → revision loop (pattern theses work identically)
- **MCP tool framework** — auth middleware, tool registration, researcher workflow
- **On-chain registrar** — Web3Service, EvidenceRegistry.sol
- **Agent abstractions** — DevilsAdvocate, Synthesis, FOIA agents (same structure, parameterized system prompts)
- **Evidence intake pipeline** — IntakeAgent + Zod validation
- **i18n / RTL** — Hebrew-first Next.js patterns

### What Closed Doors Builds Fresh (the other 60%)

These must be built first. They cannot be retrofitted.

---

## Core Architecture: Privacy-First

### 1. Encryption-First Storage

Every family gets an encrypted namespace. Content is encrypted **client-side** before upload. The server holds ciphertext and metadata only — the database admin cannot read content. This is non-negotiable.

### 2. Consent Management

Each family controls exactly what they share and at what tier. Consent is explicit, per-sharing-level, and revocable. Exit rights: a family can withdraw; their hash stays on-chain (immutable proof of existence), their content is deleted.

### 3. The Pattern Thesis (New Concept)

In Glass Fortress, a thesis is supported by evidence content.
In Closed Doors, a thesis is supported by **cryptographic commitments** from independent families:

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

## Critical Risks

### Reidentification
Even well-redacted case timelines can reidentify families in small communities. "Family with 2 kids, divorce filed March 2021, referral to Givataim welfare office" may be unique. Requires deliberate timeline fuzzing or differential privacy before any public release.

### Adversarial Threat Model
Assume the welfare ministry or a judge's legal team will eventually attempt subpoena or breach. Infrastructure implications:
- Closed Doors must NOT run on the same server as Glass Fortress
- Separate Supabase project, separate keys, separate domain
- Consider self-hosted PostgreSQL — cloud providers can receive government data requests
- No single person holds decryption keys for all families

### Legal Boundary
Each parent holds documents about their own case — they are a party to the proceeding. In Israeli law, a party's right to their own case file differs from publishing it publicly. Family court confidentiality (סעיף 68 לחוק בתי המשפט) covers *content*, not necessarily *patterns*. Legal review required before any public launch.

---

## Build Order

**Phase 0 — Extract `packages/core` from Glass Fortress**
Refactor only. Glass Fortress imports from it, nothing breaks. This creates the shared foundation.

**Phase 1 — Closed Doors foundation**
Encryption architecture + consent management + family vault model. Build these before any feature work.

**Phase 2 — Pattern layer**
Cryptographic commitment scheme. Pattern thesis concept. Aggregation rules with privacy guarantees.

**Phase 3 — Features**
Thesis engine, MCP tools, FOIA generation, agent integrations. Fast to build because the hard parts are shared from `packages/core`.

---

## Strategic Vision

What this platform represents is a **class action discovery platform for sealed proceedings** — something that doesn't exist anywhere. The reason systemic corruption in family courts persists is precisely because the sealing prevents pattern recognition.

Glass Fortress and Closed Doors are complementary arguments for the same thesis:

> **Closed systems enable abuse. The remedy is structured, privacy-preserving transparency.**

If done right — real legal cover, real cryptographic guarantees, real redaction — this matters well beyond Israel.
