# Phase 20: Thesis Builder — Crowdsourced Legal Theories

## Vision

Transform the platform from a passive evidence archive into an active legal synthesis engine.
Users write structured legal theses, anchoring each claim to real evidence and key figures.
An AI devil's advocate tries to falsify the thesis — exposing logical gaps before publication.

The published thesis feed becomes a crowdsourced litigation intelligence layer: citizen
litigators learning to write courtroom-hardened arguments.

## Design Principles

- **No AI scoring.** A numerical score implies endorsement and creates false confidence.
  The AI's job is adversarial: find every way to tear the thesis apart.
- **Falsification over validation.** If the AI tries hard to falsify the thesis and fails,
  that is the signal worth having (Popper's falsifiability principle applied to legal claims).
- **Human gate before publication.** No thesis naming a real person goes live automatically.
  `PENDING_MODERATION` is a hard stop between AI review and publication.
- **Anchored claims only.** Every claim must be tagged to an evidence record or key figure.
  Free-floating accusations are not supported by the UI.

---

## Task Breakdown

### Step 1 — Database (Prisma)

**Task 20.1:** Add `Thesis` model and supporting enums to `prisma/schema.prisma`.

```prisma
enum ThesisStatus {
  DRAFT
  AI_REVIEWED
  PENDING_MODERATION
  PUBLISHED
  REJECTED
}

model Thesis {
  id              String        @id @default(cuid())
  title           String
  content         String        // TipTap JSON (stringified)
  status          ThesisStatus  @default(DRAFT)
  aiFeedback      String?       // JSON: FalsificationResult (stringified)
  authorAddress   String        // submitter wallet address (accountability)
  publishedAt     DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  taggedEvidence  Evidence[]    @relation("ThesisEvidence")
  taggedFigures   KeyFigure[]   @relation("ThesisFigures")
}
```

Add the inverse relations to `Evidence` and `KeyFigure` models.

Run `prisma migrate dev --name phase-20-thesis`.

---

### Step 2 — Mention Endpoints (Backend)

**Task 20.2:** Create `backend/src/routes/mentionRoutes.ts`.

- `GET /api/mentions/figures?q=` — search `KeyFigure.name` (case-insensitive contains, limit 5).
  Returns `{ id, name, role }[]`.
- `GET /api/mentions/evidence?q=` — search `Evidence.summary` + `Evidence.category` (limit 5).
  Returns `{ id, summary, category, evidenceDate }[]`.
  Note: return `summary` as the display label, not `fileHash` (that is an implementation detail).

Mount at `/api/mentions` in `server.ts`.

Write Jest tests covering: empty query, partial match, limit enforcement, no results.

---

### Step 3 — ThesisValidatorAgent (Backend)

**Task 20.3:** Create `backend/src/services/ThesisValidatorAgent.ts`.

Uses `LLMFactory.getChatModel('THESIS')`. Add `THESIS_PROVIDER` to `.env.example`.

**System prompt direction:**
> You are a hostile cross-examiner preparing the opposing counsel's case.
> A user has submitted a legal thesis. Your job is NOT to validate it — your job is to
> falsify it. Find every logical gap, every unsupported inference, every place where
> the evidence cited does not actually prove what the user claims. Be rigorous and specific.
> Reference the actual evidence text in your criticism. If a claim genuinely survives
> falsification, acknowledge it.

**Zod output schema:**

```typescript
const FalsificationResultSchema = z.object({
  survivingClaims: z.array(z.string()),
  falsificationAttempts: z.array(z.object({
    claim: z.string(),         // the specific claim being attacked
    counterArgument: z.string(), // strongest opposing argument
    evidenceGap: z.string(),   // what evidence would be needed to defeat this counter
  })),
  weakestLink: z.string(),     // the single inference doing the most work with least support
  recommendedEvidence: z.array(z.string()), // what to find next to strengthen the thesis
});

export type FalsificationResult = z.infer<typeof FalsificationResultSchema>;
```

**Method:** `validate(thesisText: string, taggedEvidence: EvidenceSummary[]): Promise<FalsificationResult>`

Write Jest tests (mock LLMFactory): valid output parsing, Zod schema enforcement,
agent receives full evidence text (not just IDs).

---

### Step 4 — Thesis CRUD + Evaluate API (Backend)

**Task 20.4:** Create `backend/src/routes/thesisRoutes.ts`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/thesis` | Create draft. Body: `{ title, content, authorAddress, taggedEvidenceIds[], taggedFigureIds[] }` |
| `GET` | `/api/thesis` | List `PUBLISHED` theses (homepage feed) |
| `GET` | `/api/thesis/:id` | Get single thesis (any status — author only for non-published) |
| `PUT` | `/api/thesis/:id` | Update draft content/title/tags |
| `POST` | `/api/thesis/:id/evaluate` | Run `ThesisValidatorAgent`. Fetches full evidence summaries from Prisma, calls agent, saves `aiFeedback` + sets status `AI_REVIEWED`. Returns `FalsificationResult`. Rate-limited: max 5 evaluations per thesis. |
| `POST` | `/api/thesis/:id/submit` | Moves `AI_REVIEWED` thesis to `PENDING_MODERATION`. Requires at least one tagged evidence item. |
| `DELETE` | `/api/thesis/:id` | Delete own `DRAFT` or `REJECTED` thesis only. |

Mount at `/api/thesis` in `server.ts`.

Write Jest + supertest tests for all routes.

---

### Step 5 — TipTap Editor (Frontend)

**Task 20.5:** Install TipTap dependencies.

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-mention
```

**Task 20.6:** Create `frontend/src/app/[locale]/theses/new/page.tsx`.

Editor requirements:
- Two `Mention` extension instances with different `char` triggers:
  - `@` — fetches `/api/mentions/figures?q=...`, renders as a teal pill showing the figure's name.
  - `#` — fetches `/api/mentions/evidence?q=...`, renders as an amber pill showing the evidence summary (truncated to 40 chars).
- Toolbar: bold, italic, bullet list, numbered list, blockquote.
- Inline pill rendering for mentions (custom `MentionNode` render for each type).
- Title field (plain text input) above the editor.
- "Run Falsification Check" button — calls `POST /api/thesis/:id/evaluate`, displays result below the editor.
- "Save Draft" button — calls `POST /api/thesis` or `PUT /api/thesis/:id`.
- "Submit for Review" button — only enabled after at least one evaluation, calls `POST /api/thesis/:id/submit`.
- Full i18n: extract all strings to `messages/he.json` + `messages/en.json`. RTL-compatible.

**Falsification result display:**
- Surviving claims: green checkmarks.
- Falsification attempts: expandable red cards — claim / counter-argument / evidence gap.
- Weakest link: prominent amber warning banner.
- Recommended evidence: list with search-link to the evidence vault.

---

### Step 6 — Theses Feed (Frontend)

**Task 20.7:** Create `frontend/src/app/[locale]/theses/page.tsx`.

- Lists all `PUBLISHED` theses from `GET /api/thesis`.
- Thesis card: title, author address (truncated), tagged figure pills, evidence count, `publishedAt` date.
- Click card → `theses/[id]/page.tsx` (full thesis view, read-only rendered TipTap content).
- Add "Theses" link to site-wide navigation.

---

### Step 7 — Tests & Cleanup

**Task 20.8:** Verify full test suite passes. Target: all existing tests + new tests >= 160 total.

Checklist:
- [ ] ThesisValidatorAgent unit tests
- [ ] mentionRoutes Jest/supertest tests
- [ ] thesisRoutes Jest/supertest tests (all 7 endpoints)
- [ ] `prisma migrate` applied cleanly to Supabase
- [ ] TipTap editor renders correctly in RTL (Hebrew) mode
- [ ] Rate limit on `/evaluate` enforced
- [ ] `PENDING_MODERATION` status cannot be bypassed via API

---

## Data Flow Summary

```
User writes thesis in TipTap
  → tags @KeyFigure and #Evidence inline
  → clicks "Run Falsification Check"
      → POST /api/thesis/:id/evaluate
          → Prisma fetches full evidence summaries for all tagged IDs
          → ThesisValidatorAgent receives thesis text + evidence texts
          → AI returns FalsificationResult (devil's advocate)
          → Saved to Thesis.aiFeedback, status → AI_REVIEWED
      → Frontend renders surviving claims / falsification attempts / weakest link
  → User iterates on thesis
  → clicks "Submit for Review"
      → status → PENDING_MODERATION (human moderator must approve)
  → Moderator publishes → status → PUBLISHED → appears in theses feed
```

---

## Status

- [ ] Task 20.1 — Prisma schema + migration
- [ ] Task 20.2 — Mention endpoints + tests
- [ ] Task 20.3 — ThesisValidatorAgent + tests
- [ ] Task 20.4 — Thesis CRUD + evaluate API + tests
- [ ] Task 20.5 — TipTap dependencies installed
- [ ] Task 20.6 — New thesis editor page
- [ ] Task 20.7 — Theses feed page
- [ ] Task 20.8 — Full test suite green
