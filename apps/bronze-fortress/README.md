<p align="center">
  <img src="../../bronze_fortress.png" alt="Bronze Fortress" width="160" />
</p>

# Bronze Fortress — מבצר הנחושת

> מאחדים הורים נפגעים, חושפים שיטה, דורשים דין צדק.
>
> Private pattern analysis platform for family court and welfare system corruption.

Part of the [OpenJustice](../../README.md) platform.

**Status: In development.** Foundation phase (encryption architecture, family vault model, key figure registry). See [BRONZE_FORTRESS.md](../../BRONZE_FORTRESS.md) for full strategy.

---

## Mission

Family court proceedings in Israel are legally sealed (בית משפט לענייני משפחה בדלתיים סגורות). Each family fights alone, sees only their own case, and is told their situation is unique. It is not.

This platform enables families to **prove systemic corruption through patterns across independently sealed cases — without exposing any individual case.** The pattern is the legal argument. Individual cases are evidence of the pattern, not the public artifact.

---

## The Core Insight

You do not need to show any individual case to prove systemic corruption. You need to show that across N independently sealed cases, the same procedural violations, the same welfare workers, the same judicial behaviors appear — independently registered, without coordination.

The blockchain timestamp that predates any family-to-family connection is the proof.

---

## How It Works

### 1. Private Family Vault
Each family registers and uploads their own case documents — welfare reports (תסקיר), evaluations (חוות דעת), court orders. Content is **encrypted client-side before upload**. The server holds ciphertext only. The database admin cannot read case content.

### 2. Structured Intake
Families describe their experience through structured fields — dropdowns, yes/no — never freeform text for key facts. This makes answers machine-comparable and aggregatable while minimizing reidentification risk.

### 3. Cryptographic Commitment
Each family registers a commitment on-chain:
```
hash(keyFigureId + patternCategory + quarterYear)
```
This proves the family documented a specific pattern, with a specific official, in a specific period — **before being connected to any other family**. No case content is on-chain. The commitment is the proof of independent observation.

### 4. Pattern Matching
When N families independently commit to the same key figure + pattern combination, the platform surfaces: *"You are not alone. N other families registered this pattern."*

### 5. Graduated Cooperation
Families choose their own level of exposure:

| Level | What happens |
|---|---|
| 1 — You Are Not Alone | See count of families with same pattern. No interaction. |
| 2 — Anonymous Timeline | Opt-in: share fuzzed timeline (quarter/year, categories only) |
| 3 — Anonymous Messaging | Platform-routed messages, no identity revealed |
| 4 — Mutual Introduction | Both parties consent; real contact exchanged |
| 5 — Shared Evidence Room | Private encrypted workspace for a group |

### 6. Pattern Thesis (Published)
What gets published is never individual case content. It is a **process signature**:

> *"24 families who never met each other independently registered the identical procedural pattern: evaluation in a single session under 90 minutes, primary parent not interviewed separately. Each registration was timestamped on-chain prior to any family being connected to another."*

This makes no rate claim (no denominator = no denominator fallacy). It asserts only what the platform can prove: independent, timestamped, convergent descriptions of the same behavior.

---

## Key Figure Registry

### Who Is Tracked

The real power in family court proceedings often lies not with the judge (who may be a rubber stamp / חותמת גומי) but with:
- **Social workers** (עובדי סוציאליים) — welfare report authors
- **Evaluators** (מאבחנים) — court-appointed psychologists / psychiatrists
- **Guardians ad litem** (אפוטרופוסים לדין)

These figures are named in official documents held by the families themselves.

### Registry Creation Process

1. Family proposes a key figure during intake (name + role + organization as it appears in their official documents)
2. Proposal enters a **pending queue** — invisible, not yet queryable
3. **Activation threshold:** 3+ independent families name the same person in the same official role
4. Cross-reference with public registries (פנקס הפסיכולוגים, מרשם העובדים הסוציאליים)
5. **Legal review gate:** human approval before activation

This threshold is simultaneously the defamation guard and the proof of pattern. One family is noise. Three independent families is signal.

### Important: Process Signatures, Not Outcome Rates

The platform **cannot** claim outcome rates (e.g., "recommended removal in 28/31 cases") — it only contains cases where families felt wronged. Claiming rates from a complaint registry is statistically invalid and legally vulnerable.

The platform **can** claim process signatures: identical procedural behaviors independently described by multiple families. FOIA requests to the court can supply total caseload numbers when outcome rates are needed.

---

## Architecture

### Privacy-First by Design

The privacy model is foundational — it cannot be retrofitted. Key constraints:

- **Encryption-first storage** — client-side encryption, server holds ciphertext only
- **Consent management** — explicit, per-tier, revocable; exit rights preserved
- **Separate infrastructure** — completely separate from Glass Fortress (different server, different DB, different keys)
- **Separate infrastructure** — separate Railway service, separate Supabase project, separate keys, separate domain

### Directory Structure

```
apps/closed-doors/
  backend/
    src/
      server.ts           — Express + health endpoint
    prisma/
      schema.prisma       — Family, Commitment, KeyFigure, ConsentRecord models
  frontend/
    src/app/[locale]/     — Next.js, Hebrew default, RTL, dark theme
    messages/             — he.json + en.json
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js, TypeScript (strict), Express, Prisma |
| Encryption | libsodium-wrappers (client-side, to be implemented in CD-1.3) |
| Database | Supabase PostgreSQL (separate project from Glass Fortress) |
| Frontend | Next.js 16, TailwindCSS v4, next-intl (Hebrew default, RTL) |
| Chain | Shared EvidenceRegistry.sol with Glass Fortress |

---

## Development

**Status:** Backend shell and frontend shell are in place. CD-1 (encryption architecture) is the next phase.

```bash
# Backend
cd apps/closed-doors/backend
cp .env.example .env   # fill in keys (separate from Glass Fortress)
npm install
npm run dev            # :3002

# Frontend
cd apps/closed-doors/frontend
npm install
npm run dev            # :3003
```

---

## Deployment

- **Frontend** → Vercel
- **Backend** → Railway (separate service from Glass Fortress)
- **Database** → Supabase (separate project, separate keys)

See [DEPLOYMENT.md](../../DEPLOYMENT.md) for full rationale and setup steps.

---

## Legal Notes

- Each family contributes documents from **their own case** — a party's right to their own file differs from publishing it publicly
- Family court confidentiality (סעיף 68 לחוק בתי המשפט) covers content, not patterns
- Key figures are named in their **official capacity only** — same legal frame as Glass Fortress ministry officials
- Legal review required before any public launch
- Reidentification risk is real even with redaction — timeline fuzzing is required

See [CLOSED_DOORS.md](../../CLOSED_DOORS.md) for the full strategy document.
