<p align="center">
  <img src="./glass_fortress.png" alt="Glass Fortress" width="180" />
</p>

# OpenJustice: Project "Glass Fortress"

> The world's first open-source, AI-driven, decentralized legal evidence gathering platform.

Our goal is to crowdsource and structure a class-action lawsuit against state authorities regarding Covid-19 policy failures — withholding side-effect data, regulatory misleading, and coercion — using AI to validate evidence and Web3 to create an immutable, tamper-proof audit trail.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Foundry (Forge/Anvil/Cast), Solidity ^0.8.24, OpenZeppelin |
| Backend | Node.js, TypeScript, Express, LangChain |
| LLM | Google Gemini (default) · Anthropic Claude (configurable per agent) |
| Database | PostgreSQL via Prisma + Pinecone (vector embeddings) |
| Frontend | Next.js, TailwindCSS v4, next-intl (Hebrew/English, RTL/LTR) |

---

## Architecture

### AI Agent Swarm

- **Intake Agent** — Analyzes uploaded files (images, PDFs) using multimodal LLM vision. Classifies relevance, category, evidence tier, and key figures. Outputs a structured Hebrew-language draft for human review before any on-chain commit.
- **Thesis Validator Agent** — Devil's advocate. Given a legal thesis, it attempts falsification: identifies weak claims, evidence gaps, and counter-arguments.
- **Forensic Agent** — Monitors tracked URLs via the Wayback Machine CDX API. Diffs historical snapshots, classifies legally significant changes (retracted safety claims, removed adverse event data), and flags them for evidence promotion.
- **Legal Master Agent** — RAG pipeline: retrieves top Tier 1 & 2 evidence from the vector store by entity and category, drafts structured legal arguments with cited evidence hashes.
- **Trust Agent** — Locale-aware support chatbot (Hebrew/English). Explains the platform's mission and legal framework using a strict RAG-only system prompt.

### Core Principles

- **Security & Privacy First** — Logical air gap between personal whistleblower data (AES-256 encrypted) and public evidence records.
- **Immutability** — Every evidence file is SHA-256 hashed and registered on-chain via `EvidenceRegistry.sol`.
- **Human-in-the-Loop** — AI produces a draft; a human reviews and confirms before any blockchain write.
- **No Hallucinations** — Legal agents operate strictly on retrieved context (RAG). No invented facts or laws.

---

## Development

```bash
# Contracts
cd contracts && forge build && forge test

# Backend
cd backend && npm install && npm run dev

# Frontend
cd frontend && npm install && npm run dev
```

Tests: `forge test` (Solidity) · `npm test` (Jest/TypeScript)
