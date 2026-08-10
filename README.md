<p align="center">
  <img src="./glass_fortress.png" alt="OpenJustice" width="180" />
</p>

# OpenJustice

> An open-source, AI-driven, decentralized legal evidence platform.

OpenJustice is a protocol and toolkit for building evidence-based legal cases against institutional wrongdoing. It combines AI agents, on-chain immutability, and privacy-preserving cryptography to make systemic abuse provable — even when the systems involved are designed to hide it.

The platform currently powers two independent applications, each targeting a different domain of institutional misconduct.

---

## The Two Applications

| | [Glass Fortress](./apps/glass-fortress/) | [Closed Doors](./apps/closed-doors/) |
|---|---|---|
| **Domain** | Covid-19 policy failures, Israeli MOH | Family court & welfare system corruption |
| **Legal target** | Institutional cover-up of public safety data | Systemic misconduct in sealed proceedings |
| **Who contributes** | Whistleblowers leaking institutional documents | Victims contributing their own sealed case files |
| **Default visibility** | Public — evidence and theses are broadcast | Private — families hold encrypted vaults |
| **What gets published** | Evidence + legal theses + calls for whistleblowers | Pattern analysis only — no individual case content |
| **Proof surface** | The document + on-chain hash | Cryptographic commitments + statistical patterns |
| **Core question** | *"What can we prove publicly?"* | *"What can we prove without exposing anything?"* |
| **Deployment** | Vercel (frontend) + Railway (backend) | Vercel (frontend) + self-hosted EU VPS (backend) |

These are **not** the same codebase. The privacy model is foundational and cannot be retrofitted. See [DEPLOYMENT.md](./DEPLOYMENT.md) for infrastructure decisions.

---

## Repo Structure

```
openjustice/
  apps/
    glass-fortress/     — public evidence platform (Covid/MOH)
      backend/          — Node.js + Express + Prisma + LangChain
      frontend/         — Next.js, Hebrew-first, RTL
    closed-doors/       — private pattern platform (family courts)
      backend/          — Node.js + Express + Prisma (separate DB)
      frontend/         — Next.js, Hebrew-first, RTL, dark theme
  contracts/            — Shared Solidity: EvidenceRegistry.sol
  packages/             — Shared protocol layer (populated lazily)
```

`contracts/` is shared — both applications register evidence hashes to the same on-chain registry, enabling cross-platform corroboration.

`packages/` will be populated as shared abstractions emerge from building both apps (thesis engine, agent framework, on-chain registrar). Not yet extracted.

---

## Shared Infrastructure

### EvidenceRegistry.sol
A Solidity smart contract that registers SHA-256 evidence hashes on-chain with a timestamp and registrar signature. Deployed once, used by both platforms. Every registered hash is permanent, immutable, and publicly auditable.

### Core Principles (both platforms)
- **Human-in-the-loop** — AI produces drafts; humans confirm before any on-chain write
- **No hallucinations** — legal agents operate strictly on retrieved context (RAG only)
- **On-chain immutability** — every evidence commitment is timestamped and permanent
- **Strict TypeScript** — no `any`, Zod validation on all LLM outputs

---

## Quick Start

```bash
# Smart contracts (shared)
cd contracts && forge build && forge test

# Glass Fortress
cd apps/glass-fortress/backend && npm run dev   # :3001
cd apps/glass-fortress/frontend && npm run dev  # :3000

# Closed Doors
cd apps/closed-doors/backend && npm run dev     # :3002
cd apps/closed-doors/frontend && npm run dev    # :3003
```

Or from the root with workspace scripts:
```bash
npm run gf:backend    # Glass Fortress backend
npm run gf:frontend   # Glass Fortress frontend
npm run cd:backend    # Closed Doors backend
npm run cd:frontend   # Closed Doors frontend
npm run test:gf       # Glass Fortress tests
npm run test:cd       # Closed Doors tests
```

---

## Key Documents

| Document | Purpose |
|---|---|
| [apps/glass-fortress/README.md](./apps/glass-fortress/README.md) | Glass Fortress mission, architecture, and dev guide |
| [apps/closed-doors/README.md](./apps/closed-doors/README.md) | Closed Doors mission, privacy architecture, and dev guide |
| [CLOSED_DOORS.md](./CLOSED_DOORS.md) | Full Closed Doors strategy — read before building |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Platform decisions, why Vercel ≠ backend, hosting guide |
| [COMPLIANCE.md](./COMPLIANCE.md) | Defamation risk rules, legal framing, pre-launch checklist |
| [CLAUDE.md](./CLAUDE.md) | AI assistant instructions and code conventions |
