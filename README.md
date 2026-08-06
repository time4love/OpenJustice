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