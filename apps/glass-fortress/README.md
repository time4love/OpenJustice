# Glass Fortress

> Public evidence platform documenting concealment, coercion, and criminal liability in Israel's Covid-19 response.

Part of the [OpenJustice](../../README.md) platform.

---

## Mission

Build an evidence-based legal case against the Israeli government and Ministry of Health for concealing critical vaccine safety data and conducting a mass medical intervention without informed consent.

## Legal Strategy

A single monolithic argument is easy to attack and easy to bury. Our approach: **many focused, independent theses — each attacking from a different angle.** Each thesis targets a specific actor, a specific act of concealment, a specific regulatory failure. Together they form an interlocking case that cannot be dismissed wholesale.

Each thesis is:
- Grounded exclusively in documented evidence (no speculation)
- Stress-tested by an AI devil's advocate before publication
- Linked to on-chain immutable evidence records
- A standalone public call for evidence — shareable to recruit whistleblowers

## The Three Audiences

**Researchers** — investigators, lawyers, and technicians who build the case. They work primarily via AI + MCP tools; the UI reflects their work to the world. Write access is **invite-only** — contact via the `/researchers` page to join.

**Whistleblowers** — insiders who hold the documents that can break the case open. Each thesis publishes a specific, targeted call for exactly what it needs. Submission is anonymous, no account required.

**Public & Media** — following the case, verifying its integrity, amplifying the call. All evidence is on-chain and publicly auditable.

---

## Architecture

### Directory Structure

```
apps/glass-fortress/
  backend/
    src/
      agents/       — IntakeAgent, DevilsAdvocateAgent, ForensicAgent, etc.
      mcp/          — MCP server + tool handlers (researcher workspace)
      routes/       — Express routes (evidence, thesis, forensics, auth)
      services/     — Web3Service, VectorStoreService, WaybackScraper, etc.
    prisma/         — PostgreSQL schema (Supabase)
    test/           — Jest test suites (435 tests)
  frontend/
    src/app/        — Next.js App Router, Hebrew-first [locale] routing
    messages/       — i18n strings (he.json + en.json)
```

### AI Agent Swarm

| Agent | Role |
|---|---|
| **IntakeAgent** | Analyzes uploaded files (images, PDFs) via multimodal LLM. Classifies relevance, category, tier, and key figures. |
| **DevilsAdvocateAgent** | Stress-tests a legal thesis — identifies weak claims, evidence gaps, and counter-arguments. |
| **ForensicAgent** | Monitors tracked URLs via Wayback Machine CDX API. Diffs historical snapshots, classifies legally significant changes. |
| **ThesisSynthesisAgent** | Given a corpus of evidence, proposes a legal thesis with supporting hashes. |
| **FoiaLetterAgent** | Generates structured FOIA letters targeting Israeli ministry contacts, per thesis gap. |
| **RevisionAgent** | Suggests revised thesis text that closes open evidence gaps. |

### MCP Research Workflow

Researchers work via Claude + MCP tools, not the UI. The backend exposes a streaming MCP endpoint at `POST /api/mcp`.

**Write tools** (auth-gated, per-user token): `create_evidence_from_url`, `create_thesis_draft`, `add_thesis_version`, `start_forensic_scan`, `promote_evidence`, `generate_foia_request`, `enrich_evidence_with_history`

**Read tools** (public): `search_evidence`, `get_thesis_context`, `get_research_agenda`, `get_forensic_timeline`, `get_figure_dossier`, `suggest_thesis`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Foundry, Solidity ^0.8.24, OpenZeppelin |
| Backend | Node.js, TypeScript (strict), Express, LangChain |
| LLM | Anthropic Claude 3.5 Sonnet |
| Database | PostgreSQL via Prisma + Supabase pgvector |
| Frontend | Next.js 16, TailwindCSS v4, next-intl (Hebrew default, RTL) |
| Auth | Supabase Auth (magic link + Google OAuth) |
| Tests | Jest (435 tests) + Forge (Solidity) |

---

## Development

**Prerequisites:** Node.js 20+, npm, Foundry

```bash
# Backend
cd apps/glass-fortress/backend
cp .env.example .env        # fill in keys
npm install
npm run dev                  # :3001

# Frontend (separate terminal)
cd apps/glass-fortress/frontend
cp .env.example .env.local  # set NEXT_PUBLIC_SUPABASE_URL etc.
npm install
npm run dev                  # :3000
```

**Required env vars (backend):**
```
DATABASE_URL          # Supabase PostgreSQL
ANTHROPIC_API_KEY
GOOGLE_API_KEY        # Gemini embeddings
TOKEN_HMAC_SECRET
SUPABASE_URL
SUPABASE_ANON_KEY
RPC_URL               # Blockchain RPC (anvil locally)
PRIVATE_KEY           # REGISTRAR_ROLE wallet
CONTRACT_ADDRESS      # Deployed EvidenceRegistry
```

**Running tests:**
```bash
cd apps/glass-fortress/backend && npm test   # 435 Jest tests
cd contracts && forge test                   # Solidity tests
```

---

## Deployment

- **Frontend** → Vercel
- **Backend** → Railway (persistent Node.js process — Vercel's serverless model is incompatible with long-running Wayback scans)
- **Database** → Supabase (PostgreSQL + pgvector)

See [DEPLOYMENT.md](../../DEPLOYMENT.md) for full rationale and setup steps.

---

## Legal & Compliance

See [COMPLIANCE.md](../../COMPLIANCE.md) for defamation risk rules, required UI elements, AI prompt constraints, and the pre-launch checklist. **Read before building any public-facing feature.**
