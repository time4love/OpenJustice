# OpenJustice: Project "Glass Fortress" 🏛️🔍

## 1. Project Overview & Motivation
Project "Glass Fortress" is the world's first open-source, AI-driven, decentralized legal evidence gathering platform. 
Our motivation is to build a highly secure, crowdsourced system to construct a massive class-action/mass-tort lawsuit against state authorities regarding Covid-19 policy failures (e.g., withholding side-effect data, regulatory misleading, and coercion). 

We are utilizing "The Wisdom of the Crowd" combined with Agentic AI to process, validate, and structure legal evidence, while using Web3 (Smart Contracts) to create an immutable audit trail that prevents tampering or claims of falsified evidence.

## 2. Tech Stack
- **Smart Contracts (Web3):** Foundry (Forge, Anvil, Cast), Solidity ^0.8.24, OpenZeppelin.
- **Backend & AI:** Node.js, TypeScript, Express, LangChain (or LangGraph).
- **LLM Provider:** Anthropic (Claude 3.5 Sonnet) via API.
- **Database:** PostgreSQL (Relational) + Qdrant / Pinecone (Vector DB for RAG).
- **Frontend (Later phase):** React/Next.js, TailwindCSS.

## 3. Core Directives for Claude (AI Coding Assistant)
⚠️ **CLAUDE, READ THIS BEFORE EXECUTING ANY TASK:** ⚠️
1. **Security & Privacy First:** Assume all user data is highly sensitive. Medical/Personal data must be strictly isolated from public evidence data (Logical Air Gap). 
2. **Immutability:** Every piece of evidence must be hashed (SHA-256) and logged on-chain.
3. **Clean Code & TDD:** Write highly modular, DRY, and SOLID code. ALWAYS write tests (Forge tests for Solidity, Jest for TS) alongside or before the implementation. Aim for >90% coverage.
4. **Strict Typing:** Use TypeScript strictly. All LLM agent outputs must be parsed and validated using `zod`.
5. **No Hallucinations:** When acting as a Legal AI Agent, strictly rely on the context provided via RAG. Never invent laws or facts.
6. **Iterative Updates:** Whenever you finish a task, ask the user if you should update the `Task Tracker` below to change the status to `[x] DONE`.

## 4. Architecture: The AI Swarm
- **The Intake Agent:** Analyzes uploaded text/images, categorizes the legal claim, summarizes it, and flags missing information.
- **The Validator Agent (Web3):** Hashes the raw file and interacts with the Smart Contract to log proof-of-existence.
- **The Legal Master (RAG):** Cross-references new evidence with the master lawsuit draft and updates the public dashboard.

---

## 5. Task Tracker & Roadmap (Living Document)

### Phase 1: Web3 Immutability Foundation (MVP)
- [x] **Task 1.1:** Initialize Foundry project (`/contracts`).
- [x] **Task 1.2:** Write `EvidenceRegistry.sol` (Structs: fileHash, timestamp, submitter, category). Ensure no duplicates mapping.
- [x] **Task 1.3:** Write 100% coverage Forge tests (`EvidenceRegistry.t.sol`).
- [x] **Task 1.4:** Setup deployment script for local Anvil network.

### Phase 2: AI Intake Backend & Validation
- [x] **Task 2.1:** Initialize Node.js/TypeScript backend (`/backend`). Set up ESLint/Prettier.
- [x] **Task 2.2:** Create basic Express server with an upload endpoint (mocking file storage for now).
- [x] **Task 2.3:** Implement Web3 Provider utility (ethers.js or viem) to interact with `EvidenceRegistry.sol` and submit hashes.
- [x] **Task 2.4:** Build `IntakeAgent.ts` using LangChain. Define strict `zod` schema for the LLM output (isRelevant, category, summary, missingInfo).
- [x] **Task 2.5:** Write Jest tests for the IntakeAgent (mocking the LLM API response).

### Phase 3: Knowledge Base (RAG Integration)
- [x] **Task 3.1:** Setup Vector DB connection (e.g., Pinecone/Qdrant client).
- [x] **Task 3.2:** Build `VectorStoreService.ts` to generate embeddings for the summarized evidence and upsert to the DB.
- [x] **Task 3.3:** Implement a retrieval endpoint (`GET /evidence/search`) to query the vector store for specific legal claims.

### Phase 4: The Public Dashboard (Frontend MVP) — Evidence Vault
- [x] **Task 4.1:** Initialize Next.js frontend (`/frontend`).
- [x] **Task 4.2:** Build Evidence Vault Dashboard (analytics stats, category bars, live evidence ledger with targetEntity/tier/category badges).
- [x] **Task 4.3:** Build Submit Evidence form — displays AI analysis result including targetEntity, evidenceTier, txHash, and missingInformation.

### Phase 6: i18n & RTL Support
- [x] **Task 6.1:** Install `next-intl`, move pages to `app/[locale]/`, create `proxy.ts` for locale routing (default: `he`, supported: `he`, `en`). Extract UI strings to `messages/en.json` and `messages/he.json`.
- [x] **Task 6.2:** Set `lang={locale}` and `dir` on `<html>` tag. Replace all physical Tailwind directional classes (`ml-`, `pr-`, `border-l-`, etc.) with logical equivalents (`ms-`, `pe-`, `border-s-`, etc.) across all components.
- [x] **Task 6.3:** Update `IntakeAgent.ts` and `LegalMasterAgent.ts` system prompts to output Hebrew (עברית). Keep category/tier enums in English for DB consistency.

### Phase 5: The Legal Master Brain (Argument Generation)
- [x] **Task 5.1:** Create `LegalMasterAgent.ts`. Use LangChain to build a RAG pipeline that fetches top Tier 1 & 2 evidence from Pinecone filtered by `targetEntity` and `category`.
- [x] **Task 5.2:** Define Zod schema for argument output (`title`, `legalTheory`, `draftedText`, `citedHashes`) and write robust Jest tests for the agent.
- [x] **Task 5.3:** Create `argumentRoutes.ts` with a `POST /api/arguments/generate` endpoint and mount it to the Express server.
- [x] **Task 5.4:** Frontend - Create `/case-builder` page. Build a two-pane UI: A control panel (Category & Target Entity selectors) and a "Legal Paper" view to display the generated argument and citations.

### Phase 7: Multimodal Intake & Human-in-the-Loop
- [x] **Task 7.1:** Install `multer` + `@types/multer`. Configure in-memory multer middleware (`multer({ storage: multer.memoryStorage() })`). Update `POST /api/evidence/intake` to accept `multipart/form-data` file uploads (image/jpeg, image/png, application/pdf, max 10 MB).
- [x] **Task 7.2:** Rewrite `IntakeAgent.ts`. Accepts `fileBuffer: Buffer` and `mimeType: string`. Single direct LLM call — passes file as base64 image_url (images) or document block (PDF) with combined legal analyst + Hebrew output system prompt. No RAG context search. Returns Zod-parsed draft. No hashing or blockchain/vector-store writes.
- [x] **Task 7.3:** `POST /api/evidence/intake` returns draft `{ analysis }` only. New `POST /api/evidence/confirm` accepts original file + `draftedData` JSON + `submitterAddress` → SHA-256 hash → `Web3Service.registerEvidenceHash` → `VectorStoreService.upsertEvidence` → returns `{ fileHash, txHash, analysis }`.
- [x] **Task 7.4:** Overhaul frontend submit page with drag & drop upload zone. State machine: **Upload** → **Review** (AI draft in Hebrew, editable category/entity/tier) → **Confirmed** (blockchain tx hash card). 39/39 Jest tests passing.

### Phase 9: Zero-Friction Whistleblower Flow & Dark Vault PII Isolation
- [x] **Task 9.1:** Dark Vault — AES-256-CBC encrypted SQLite via Prisma. `POST /api/evidence/contact` stores whistleblower contact info encrypted, isolated from the public evidence DB and AI.
- [x] **Task 9.2:** Blockchain anonymity — `POST /api/evidence/confirm` registers hashes with `ethers.ZeroAddress` (no submitter identity on-chain). Backend wallet pays gas.

### Phase 10: The Trust Center & AI Support Agent (Locale-Aware)
- [x] **Task 10.1:** Create `backend/src/services/TrustAgent.ts`. Uses `@langchain/google-genai` (Gemini 2.0 Flash). `getSystemPrompt(locale)` returns a fully-localised system prompt — separate EN and HE manifesto texts each with a strict language directive. `chat(message, history, locale)` selects the correct prompt per request.
- [x] **Task 10.2:** Create `backend/src/routes/chatRoutes.ts` — `POST /api/chat`. Accepts `{ message, history, locale }` (locale defaults to `'he'`, validated as `'he' | 'en'`). Zod-validated (max 2 000 chars, max 50 history entries). Mounted at `/api/chat` in `server.ts`.
- [x] **Task 10.4:** Create `backend/src/factories/LLMFactory.ts`. `LLMFactory.getChatModel(agentType, options)` reads `[AGENT_TYPE]_PROVIDER` env var; returns `ChatGoogleGenerativeAI` (gemini-flash-latest) by default or `ChatAnthropic` (claude-sonnet-4-6) when set to `'anthropic'`. Swap any agent's provider with zero code changes.
- [x] **Task 10.5:** Refactor `IntakeAgent.ts`, `LegalMasterAgent.ts`, `TrustAgent.ts` — all direct provider instantiations replaced with `LLMFactory.getChatModel('INTAKE'|'LEGAL'|'TRUST')`. Added `INTAKE_PROVIDER`, `LEGAL_PROVIDER`, `TRUST_PROVIDER` to `.env` and `.env.example`. Updated both test files to mock `LLMFactory` instead of `@langchain/anthropic`. 64/64 tests passing.
- [x] **Task 10.3:** Frontend Trust Center — `app/[locale]/about/page.tsx` fully i18n'd via `useTranslations('about')` — all strings extracted to `messages/he.json` and `messages/en.json`. Three-pillar manifesto layout (Mission, Blockchain Guarantee, Dark Vault), trust badge row, hero, CTA. Global `FloatingChatWidget.tsx` in `[locale]/layout.tsx`: `useLocale()` drives the `locale` sent to `/api/chat`, the `dir` attribute on the chat panel, bubble alignment (`justify-start`/`justify-end` flipped per direction), tail corner rounding (`rounded-ss-none`/`rounded-se-none`), and all UI strings via `useTranslations('chat')`.
### Phase 20: Thesis Builder — Crowdsourced Legal Theories
> Full plan: [docs/phases/phase-20-thesis-builder.md](docs/phases/phase-20-thesis-builder.md)
- [ ] **Task 20.1:** Prisma — `Thesis` model, `ThesisStatus` enum, M2M to `Evidence` + `KeyFigure`, migration.
- [ ] **Task 20.2:** Mention endpoints — `GET /api/mentions/figures` + `GET /api/mentions/evidence` + tests.
- [ ] **Task 20.3:** `ThesisValidatorAgent.ts` — devil's advocate falsification agent, `FalsificationResult` Zod schema, tests.
- [ ] **Task 20.4:** Thesis CRUD + evaluate API — 7 endpoints in `thesisRoutes.ts`, rate limit on `/evaluate`, tests.
- [ ] **Task 20.5:** Install TipTap dependencies in frontend.
- [ ] **Task 20.6:** New thesis editor page — TipTap with `@figure` / `#evidence` mentions, falsification result display, i18n + RTL.
- [ ] **Task 20.7:** Theses feed page — published theses list + full thesis view.
- [ ] **Task 20.8:** Full test suite green (target >= 160 tests).
