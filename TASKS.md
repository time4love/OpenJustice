# Task Tracker — Project Glass Fortress

> Living document. Update status as phases complete.

---

## Phase 1 — Web3 Immutability Foundation
- [x] **1.1** Foundry project initialized at `/contracts` (forge-std + OZ installed)
- [x] **1.2** `EvidenceRegistry.sol` with AccessControl (REGISTRAR_ROLE, constructor, onlyRole on submit)
- [x] **1.3** `EvidenceRegistry.t.sol` — 28 tests, 100% lines/statements/branches/funcs
- [x] **1.4** Deployment script at `/contracts/script/DeployEvidenceRegistry.s.sol`

## Phase 2 — AI Intake Backend & Validation
- [x] **2.1** Backend initialized at `/backend` (TS strict, ESLint flat config, Prettier)
- [x] **2.2** Express server at `/backend/src/server.ts` (GET /health verified)
- [x] **2.3** `Web3Service.ts` — ethers v6, JsonRpcProvider + Wallet, registerEvidenceHash()
- [x] **2.4** `IntakeAgent.ts` — ChatAnthropic + withStructuredOutput(ZodSchema), evidenceTier enum (4 tiers)
- [x] **2.5** `IntakeAgent.test.ts` — 15 tests, 100% mocked (no API calls)
- [x] **2.6** `evidenceRoutes.ts` — POST /api/evidence/intake, lazy singletons, DuplicateEvidenceError → 409

## Phase 3 — Knowledge Base (RAG Integration)
- [x] **3.1** Pinecone client initialized in `VectorStoreService.create()` (async factory pattern)
- [x] **3.2** `VectorStoreService.ts` — OpenAI text-embedding-3-small, upsertEvidence, searchSimilarEvidence
- [x] **3.3** GET /api/evidence/search?q=&limit= endpoint

## Phase 4 — Public Dashboard (Evidence Vault)
- [x] **4.1** Next.js frontend initialized at `/frontend`
- [x] **4.2** Evidence Vault dashboard — analytics stats, category bars, live evidence ledger
- [x] **4.3** Submit Evidence form — AI analysis result, targetEntity, evidenceTier, txHash, missingInformation

## Phase 5 — Legal Master Brain (Argument Generation)
- [x] **5.1** `LegalMasterAgent.ts` — RAG pipeline, top Tier 1 & 2 evidence by targetEntity + category
- [x] **5.2** Zod schema for argument output (title, legalTheory, draftedText, citedHashes) + Jest tests
- [x] **5.3** `argumentRoutes.ts` — POST /api/arguments/generate
- [x] **5.4** `/case-builder` page — control panel + Legal Paper view

## Phase 6 — i18n & RTL Support
- [x] **6.1** next-intl installed, pages moved to `app/[locale]/`, `proxy.ts` for locale routing (default: `he`)
- [x] **6.2** `lang` + `dir` on `<html>`. All Tailwind directional classes converted to logical equivalents
- [x] **6.3** IntakeAgent + LegalMasterAgent system prompts output Hebrew; enums stay English

## Phase 7 — Multimodal Intake & Human-in-the-Loop
- [x] **7.1** multer in-memory middleware, multipart intake endpoint (image/jpeg, image/png, PDF, max 10 MB)
- [x] **7.2** IntakeAgent rewritten — single multimodal LLM call, base64 image_url or document block
- [x] **7.3** POST /intake returns draft only; POST /confirm: hash → on-chain → vector store
- [x] **7.4** Submit page state machine: Upload → Analyzing → Review → Confirming → Confirmed

## Phase 8 — Evidence Timeline
- [x] **8.1** `VectorStoreService.getTimeline()` + GET /api/evidence/timeline + 9 Jest tests
- [x] **8.2** `/timeline` page — vertical timeline, tier badges, entity filter, i18n/RTL

## Phase 9 — Data Layer & Whistleblower Flow
- [x] **9.1** Prisma + SQLite — Evidence model; all endpoints migrated from Pinecone metadata to Prisma
- [x] **9.2** Blockchain anonymity — hashes registered with `ethers.ZeroAddress` (no submitter on-chain)

## Phase 10 — Trust Center & AI Support Agent
- [x] **10.1** `TrustAgent.ts` — Gemini, locale-aware system prompt (HE/EN)
- [x] **10.2** POST /api/chat — Zod-validated, max 2000 chars, 50 history entries
- [x] **10.3** About page fully i18n'd; `FloatingChatWidget.tsx` in locale layout (RTL-aware)
- [x] **10.4** `LLMFactory.ts` — provider switching via env vars per agent (`[AGENT]_PROVIDER=anthropic|gemini`)
- [x] **10.5** All agents refactored to use LLMFactory; tests mock LLMFactory

## Phase 15 — Evidence Roles
- [x] `evidenceRole` field ('Incriminating' | 'ContextAnchor'), 'Factual Baseline' category, role badges in submit + timeline UI

## Phase 16 — Source Retention & Storage
- [x] `sourceUrl` (web links) + `fileUrl` (uploaded files) stored in Prisma
- [x] Files persisted to `backend/uploads/` as `<uuid>.<ext>`, served at /api/uploads/
- [x] Timeline cards show "View Source" button

## Phase 17 — Wayback Machine Forensic Diff Tool
- [x] **17.0** `ForensicAgent.ts`, `WaybackScraper.ts`, `forensicsRoutes.ts` (6 endpoints), Prisma models (TrackedUrl, UrlVersionDiff, WaybackScrapeJob), promote-to-evidence flow
- [x] **17.1** Full audit trail — all diffs saved regardless of significance; AI annotates, never censors
- [x] **17.2** CDX batch pagination — MAX_SNAPSHOTS=50 per batch, oldest-first, `fromDate` column
- [x] **17.3** TrackedUrl-first architecture — `runFullScan()` fire-and-forget; frontend polls status endpoint
- [x] **17.4** Coupled diff schema — `deletedItems/addedItems ({summary, exactQuote}[])` replaces parallel string arrays
- [x] **17.5** Pause/Resume — PAUSED status, `pauseScan()`, checkpoint at snapshot boundary

## Phase 20 — Thesis Builder (Crowdsourced Legal Theories)
- [x] **20.1** Prisma — `Thesis` model, `ThesisStatus` enum, M2M to Evidence + KeyFigure
- [x] **20.2** Mention endpoints — GET /api/mentions/figures + GET /api/mentions/evidence
- [x] **20.3** `ThesisValidatorAgent.ts` — devil's advocate falsification, `FalsificationResult` Zod schema
- [x] **20.4** Thesis CRUD + evaluate API — 7 endpoints, rate-limit on /evaluate
- [x] **20.5** TipTap dependencies installed in frontend
- [x] **20.6** Thesis editor — TipTap with @figure / #evidence mentions, falsification display, i18n + RTL
- [x] **20.7** Theses feed + full thesis view; all statuses visible publicly (DRAFT → PUBLISHED)
- [x] **20.8** 188/188 backend tests passing

---

## Up Next
<!-- Add upcoming phases here -->
