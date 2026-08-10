# Deployment Architecture

> Decision log and platform recommendations for Glass Fortress and Closed Doors.
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
│  Closed Doors                                           │
│  frontend → Vercel (Next.js native)                     │
│  backend  → self-hosted VPS (see below)                 │
│  database → self-hosted PostgreSQL on same VPS          │
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

## Closed Doors Backend — Self-Hosted VPS

**Why self-hosted, not Railway/Render:**
The families using Closed Doors face an adversarial government actor with legal subpoena tools.
Cloud providers (Railway, Render, AWS, GCP) can receive and must comply with Israeli government
data requests. A VPS in Germany is subject to GDPR and German data protection law — significantly
stronger protection and political distance.

**Recommended provider:** Hetzner (Germany / Finland) — €4–6/month for a capable VPS.
- Jurisdiction: EU (GDPR), not Israeli
- No US CLOUD Act exposure (unlike AWS/GCP/Azure)
- Affordable, reliable

**Database:** Self-hosted PostgreSQL on the same VPS.
- Do NOT use Supabase for Closed Doors — it's a US company (subject to US subpoenas)
- Backups encrypted, stored separately

**Deploy steps (when ready):**
1. Provision Hetzner VPS (Ubuntu 22.04 LTS, minimum 2GB RAM)
2. Install Node.js, PostgreSQL, nginx (reverse proxy)
3. Set up systemd service for the Express app
4. SSL via Let's Encrypt
5. Separate domain from Glass Fortress — no shared infrastructure
6. Firewall: only ports 80/443 public; DB port internal only

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

Both platforms (Glass Fortress + Closed Doors) should use the **same deployed contract**.
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

### Closed Doors Backend (self-hosted VPS)
```
DATABASE_URL          # Self-hosted PostgreSQL on same VPS
ANTHROPIC_API_KEY     # Claude API
TOKEN_HMAC_SECRET     # Separate secret from Glass Fortress
RPC_URL               # Same blockchain RPC as Glass Fortress
PRIVATE_KEY           # Separate REGISTRAR_ROLE wallet — not shared with GF
CONTRACT_ADDRESS      # Same deployed EvidenceRegistry contract
ENCRYPTION_MASTER_KEY # Future: server-side key for E2E encryption layer
```

---

## What to Do With vercel.json

`vercel.json` at the repo root currently defines both frontend and backend services.
- **Frontend service config:** keep and update path to `apps/glass-fortress/frontend`
- **Backend service config:** remove — backend goes to Railway
- Long-term: vercel.json may only be needed if the frontend deployment requires custom config
  (rewrites, headers, etc.) beyond Vercel's Next.js auto-detection
