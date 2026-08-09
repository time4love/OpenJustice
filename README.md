<p align="center">
  <img src="./glass_fortress.png" alt="Glass Fortress" width="180" />
</p>

# OpenJustice: Project "Glass Fortress"

> The world's first open-source, AI-driven, decentralized legal evidence gathering platform.

---

## Mission

We are building an evidence-based legal case against the Israeli government and Ministry of Health for concealing critical safety information and conducting a mass medical intervention without proper informed consent during the Covid-19 crisis.

## Legal Strategy

A single monolithic argument is easy to attack and easy to bury. Our strategy is different: **many focused, independent theses — each attacking from a different angle.** Each thesis targets a specific actor, a specific act of concealment, a specific regulatory failure. Together they form an interlocking case that cannot be dismissed wholesale.

Each thesis is:
- Grounded exclusively in documented evidence (no speculation)
- Stress-tested by an AI devil's advocate before publication
- Linked to on-chain immutable evidence records
- A standalone "call for evidence" — publicly shareable to recruit whistleblowers

## The Three Audiences

**Researchers** — investigators, lawyers, and technicians who build the case. They work primarily via AI + MCP tools; the UI reflects their work to the world. Write access is **invite-only** — contact us to join.

**Whistleblowers** — insiders who hold the documents that can break the case open. Internal protocols, meeting recordings, suppressed data. Each thesis publishes a specific call for exactly what it needs. Submission is anonymous, no account required.

**Public & Media** — following the case, verifying its integrity, amplifying the call. All evidence is on-chain and publicly auditable.

---

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
