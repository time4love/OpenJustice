# Deployment Architecture

> Decision log and platform recommendations for Glass Fortress and Bronze Fortress.
> Read before touching any deployment config.

---

## Core Principle: Frontend and Backend Are Different Animals

The Next.js frontends are stateless and serverless-compatible — Vercel is the right home.
The Express backends are **not**. They run long-running background jobs, hold in-memory state,
and stream SSE responses. Serverless kills all three.

---

## Why Vercel Is Wrong for the Backend

| Problem | Detail |
|---|---|
| **Timeout** | Max 60s (Pro). Wayback Machine scans run for minutes to hours. |
| **Fire-and-forget dies** | When the HTTP response is sent, the serverless instance terminates. `runFullScan()` dies mid-scan. |
| **In-memory state evaporates** | `_runningScanIds` / `_pausedScanIds` are in-memory Sets. Each cold start is a fresh instance — state is lost, idempotency guards break. |
| **SSE fragility** | MCP endpoint streams SSE. Serverless platforms buffer, timeout, or drop mid-stream. |

**The vercel.json in this repo is a legacy artifact. Do not use it for the backend.**

---

## Target Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Glass Fortress                                         │
│  frontend → Vercel (Next.js native)                     │
│  backend  → Railway (persistent Node.js process)        │
│  database → Supabase (PostgreSQL + pgvector)            │
│  chain    → public L2 (Base or Polygon) — TBD          │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Bronze Fortress                                           │
│  frontend → Vercel (Next.js native)                     │
│  backend  → Railway (separate service, same monorepo)   │
│  database → Supabase (separate project from GF)         │
│  chain    → same public L2 as Glass Fortress            │
└─────────────────────────────────────────────────────────┘
```

---

## Glass Fortress Backend — Railway

**Why Railway:**
- Deploys a persistent Node.js process directly from the repo — zero architecture changes
- No timeout limits
- ~$5–7/month
- Simple, low ops overhead
- Data is public-facing anyway — cloud provider subpoena risk is acceptable

**Deploy steps (when ready):**
1. Connect Railway to this repo, set root to `apps/glass-fortress/backend`
2. Set all env vars (DATABASE_URL, ANTHROPIC_API_KEY, etc.)
3. Railway runs `npm run build` then `npm start`
4. Point `BACKEND_URL` in Glass Fortress frontend env to the Railway URL

---

## Bronze Fortress Backend — Railway

**Why Railway (same as Glass Fortress):**
- Persistent Node.js process — no serverless timeout constraints
- Same platform as Glass Fortress — consolidated tooling, no new accounts
- Deployed as a separate Railway service pointing to `apps/bronze-fortress/backend`
- ~$5–7/month

**Why not a self-hosted VPS:**
The families using Bronze Fortress are not committing any crime. They are documenting their own
cases using documents they legally own. All sensitive case content is encrypted client-side —
the server holds ciphertext only. The remaining metadata (pattern counts, commitment hashes)
is either non-identifying or, if visible to documented actors, acts as a deterrent.
A VPS was considered for the threat model but the threat model did not survive scrutiny.
Consolidated tooling (Railway) is the right tradeoff at this stage.

**Database:** Supabase — separate project from Glass Fortress.
- Separate project URL, separate keys, separate anon key
- No data shared with or visible from the Glass Fortress project

**Deploy steps (when ready):**
1. Create a new Railway service, set root to `apps/bronze-fortress/backend`
2. Create a new Supabase project for Bronze Fortress
3. Set all env vars (DATABASE_URL from CD Supabase project, separate TOKEN_HMAC_SECRET, etc.)
4. Railway runs `npm run build` then `npm start`
5. Point `BACKEND_URL` in Bronze Fortress frontend env to the Railway service URL

---

## Scan Job Architecture — Current Limitation

**Problem:** Long-running Wayback scans rely on in-memory state and fire-and-forget.
If the server restarts mid-scan, `_runningScanIds` is lost and the DB record is stuck
at SCANNING. The current resume mechanism requires a human to retry via POST /scan.

**Production fix (Phase GF-Infra-1 — do before public launch):**
Add **BullMQ + Redis** job queue.
- Scan jobs are enqueued, not fire-and-forget
- Worker process picks up jobs — restarts are transparent
- Job state persists in Redis, not in-memory
- Pause/resume survives server restarts
- This is platform-independent — works on Railway or VPS

```
Express API  →  BullMQ Queue (Redis)  →  Worker process
(enqueue)                                 (runs scan, updates DB)
```

Redis can be Railway's Redis add-on (~$3/month) or a self-hosted Redis on the same VPS.

---

## Blockchain

**Development:** Local Anvil node (`anvil` from Foundry)

**Production:** Public L2 — decision pending.
- **Base** (Coinbase L2 on Ethereum) — low fees, high legitimacy, good tooling
- **Polygon** — battle-tested, low fees, widely supported
- Avoid mainnet Ethereum — gas fees make per-evidence registration impractical

Both platforms (Glass Fortress + Bronze Fortress) should use the **same deployed contract**.
Cross-platform hash corroboration ("this document appears in both investigations") is only
possible if they share a chain and contract address.

EvidenceRegistry.sol is already written and tested. Deployment is a `forge script` away.

---

## Environment Variables Reference

### Glass Fortress Backend (Railway)
```
DATABASE_URL          # Supabase PostgreSQL connection string
ANTHROPIC_API_KEY     # Claude API
GOOGLE_API_KEY        # Gemini embeddings
TOKEN_HMAC_SECRET     # Per-user MCP token signing
SUPABASE_URL          # Supabase project URL
SUPABASE_ANON_KEY     # Supabase anon key
UPLOADS_DIR           # Absolute path for file uploads on Railway volume
RPC_URL               # Blockchain RPC endpoint
PRIVATE_KEY           # REGISTRAR_ROLE wallet private key
CONTRACT_ADDRESS      # Deployed EvidenceRegistry address
MCP_WRITE_TOKEN       # Legacy — replaced by per-user tokens (Phase 27)
```

### Bronze Fortress Backend (Railway)
```
DATABASE_URL          # Supabase PostgreSQL connection string (CD project)
ANTHROPIC_API_KEY     # Claude API
TOKEN_HMAC_SECRET     # Separate secret from Glass Fortress
SUPABASE_URL          # Bronze Fortress Supabase project URL
SUPABASE_ANON_KEY     # Bronze Fortress Supabase anon key
RPC_URL               # Same blockchain RPC as Glass Fortress
PRIVATE_KEY           # Separate REGISTRAR_ROLE wallet — not shared with GF
CONTRACT_ADDRESS      # Same deployed EvidenceRegistry contract
```

---

## What to Do With vercel.json

`vercel.json` at the repo root currently defines both frontend and backend services.
- **Frontend service config:** keep and update path to `apps/glass-fortress/frontend`
- **Backend service config:** remove — backend goes to Railway
- Long-term: vercel.json may only be needed if the frontend deployment requires custom config
  (rewrites, headers, etc.) beyond Vercel's Next.js auto-detection
