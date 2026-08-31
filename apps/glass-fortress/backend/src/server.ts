import 'dotenv/config';
import path from 'path';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// ---------------------------------------------------------------------------
// Process-level crash guards — must be registered before any other code.
// Prevents the Node process from dying on unhandled promise rejections or
// synchronous exceptions, which would cause ECONNRESET at the proxy layer.
// ---------------------------------------------------------------------------

process.on('unhandledRejection', (reason) => {
  console.error('[process] Unhandled promise rejection (process kept alive):', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[process] Uncaught exception (process kept alive):', err);
});
import { evidenceRouter } from './routes/evidenceRoutes';
import { argumentRouter } from './routes/argumentRoutes';
import { chatRouter } from './routes/chatRoutes';
import { forensicsRouter } from './routes/forensicsRoutes';
import { articleRulesRouter } from './routes/articleRulesRoutes';
import { figuresRouter } from './routes/figuresRoutes';
import { mentionRouter } from './routes/mentionRoutes';
import { thesisRouter } from './routes/thesisRoutes';
import { mcpRouter } from './mcp/mcpRoutes';
import { authRouter } from './routes/authRoutes';
import { reportRouter } from './routes/reportRoutes';
import { prisma } from './lib/prisma';
import { verifyEnvironmentIdentityAtStartup } from './lib/appEnv';
import { requireStagingAccess } from './middleware/stagingAccess';
import { generalLimiter } from './middleware/rateLimiting';
import { oidcProvider } from './oauth/oidcProvider';
import { oauthInteractionRouter } from './routes/oauthInteractionRoutes';
import { wellKnownRouter } from './routes/wellKnownRoutes';
import { VectorStoreService } from './services/VectorStoreService';

// ---------------------------------------------------------------------------
// Refuse to run against the wrong database. Must happen before anything opens a
// connection: the whole point is that a misconfigured process never writes.
// ---------------------------------------------------------------------------

try {
  verifyEnvironmentIdentityAtStartup();
} catch (err) {
  console.error(`[startup] FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

const app = express();
const PORT = process.env['PORT'] ?? 3000;

// Railway sits in front of this process as a single reverse proxy — without
// this, express-rate-limit (and anything else reading req.ip) sees every
// request as coming from the proxy's IP, not the real client.
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Public assets — the connector's icon, and the favicon a client falls back to
// when a server declares none.
//
// Mounted ABOVE both the CORS allow-list and the staging gate, because both
// refuse the caller that matters here. The gate answered /favicon.ico with 401,
// and CORS answered a claude.ai-origin fetch with 500 — so Claude could not
// read the icon by either route and the connector list showed the hosting
// platform's logo instead of ours.
//
// Any origin may read these: they are public images, served without
// credentials, and carry nothing the allow-list exists to protect.
// ---------------------------------------------------------------------------

const ICON_PATH = path.join(__dirname, '..', 'public', 'icon.png');

app.get(['/icon.png', '/favicon.ico'], cors({ origin: '*' }), (_req, res) => {
  res.type('image/png').sendFile(ICON_PATH);
});

// ---------------------------------------------------------------------------
// CORS — allow configured frontend origin(s) + localhost for dev
// ---------------------------------------------------------------------------

const allowedOrigins = [
  process.env['FRONTEND_URL'],          // e.g. https://glass-fortress.vercel.app
  'http://localhost:3001',              // Next.js dev (port may vary)
  'http://localhost:3002',
  'http://localhost:3000',
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header) and Next.js SSR rewrites
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      // Not an Error: throwing here becomes an unhandled 500, which reports a
      // server fault for what is a browser-side policy decision — and buries
      // real failures in the log. Omitting the header is what the browser
      // actually acts on.
      callback(null, false);
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '20mb' }));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'Glass Fortress Backend is Alive' });
});

// /oauth/* (docs/gf-mcp-oauth-dev-plan.md, Phase 2) also stays above the staging
// gate, for the same reason /health does — but a different actual requirement:
// Dynamic Client Registration and OAuth discovery metadata must be reachable by
// an arbitrary external client (Claude, ChatGPT) with no pre-shared secret at
// all, which is the entire point of DCR. Gating it behind the staging token
// would make it untestable by any real MCP client, on staging, ever. This does
// not weaken real security — registering a client or starting `/oauth/auth`
// grants nothing by itself; every subsequent step still requires an approved
// Researcher to complete the login/consent step (oauthInteractionRouter,
// below) — which is exactly what re-verifies approval for real.
//
// oauthInteractionRouter is registered BEFORE the oidcProvider.callback()
// catch-all so Express matches its more specific /oauth/interaction/* paths
// first; oidc-provider itself serves no routes under that path.
app.use('/oauth/interaction', oauthInteractionRouter);
app.use('/oauth', oidcProvider.callback());

// /api/mcp also stays above the staging gate, for the same reason /oauth
// does: an external MCP client (ChatGPT in particular) that completes the
// full OAuth dance above still has no way to attach a custom X-Staging-Token
// header to its actual tool calls — gating this route would make write
// tools untestable by any real MCP client on staging, permanently. This
// does not weaken security: read tools are already unauthenticated on
// production (same exposure, not a new one), and write tools are still
// fully gated by resolveResearcher()'s own OAuth/legacy-token + approved-
// researcher check inside mcpRouter — the staging pre-shared secret was
// never that check, just a coarser "keep the whole unfinished site private"
// layer that doesn't compose with a subsystem designed for arbitrary
// self-service external clients.
//
// Because this mount sits ABOVE `app.use('/api', generalLimiter)` below,
// Express matched /api/mcp here and returned before the limiter ever ran —
// leaving the MCP endpoint as the only completely uncapped surface on the
// backend. That was an accident of mount order, not a decision, so the limiter
// is attached directly rather than by moving the mount (which would re-gate the
// route behind requireStagingAccess and break external clients, per above).
//
// generalLimiter, not aiCostLimiter: a single MCP session spends requests on
// protocol chatter — initialize, tools/list — before any tool call, so a
// 10-per-15-minute cap would exhaust itself on handshakes. The paid tools are
// gated by resolveResearcher() instead; this bounds the anonymous read surface,
// where search_evidence still embeds a query on every call.
//
// Note the keying: express-rate-limit counts per IP, and every claude.ai
// request arrives from Anthropic's shared egress, so this is effectively
// per-provider rather than per-user. Fine at GF's scale, and still far better
// than uncapped — but it is not a per-tenant quota and should not be mistaken
// for one.
app.use('/api/mcp', generalLimiter, mcpRouter);

// /.well-known/oauth-protected-resource[/api/mcp] — RFC 9728, mandated by the
// MCP Authorization spec for authorization-server discovery. Same exemption
// reasoning as /oauth and /api/mcp above: a client that hasn't authenticated
// yet, by definition, cannot present the staging secret to find out where to
// authenticate. Confirmed live this was actually blocking a real claude.ai
// connection attempt — see docs/gf-mcp-oauth-dev-plan.md §7.0c.
app.use('/.well-known', wellKnownRouter);

// Everything below requires the staging bearer token once APP_ENV=staging.
// /health stays above this line so Railway's platform healthcheck, which
// carries no auth header, keeps working.
app.use(requireStagingAccess);

// Applies to every /api/* route. LLM/on-chain-triggering routes stack a
// tighter `aiCostLimiter` on top — see docs/gf-cost-exposure-dev-plan.md.
app.use('/api', generalLimiter);

// ---------------------------------------------------------------------------
// GET /api/stats — platform-wide aggregate counts for the home page mission board
// ---------------------------------------------------------------------------

app.get('/api/stats', async (_req: Request, res: Response) => {
  try {
    const [evidenceCount, thesisCount, forensicDiffCount] = await Promise.all([
      prisma.evidence.count({ where: { status: 'CONFIRMED' } }),
      prisma.thesis.count(),
      prisma.urlVersionDiff.count({ where: { isLegallySignificant: true } }),
    ]);
    res.json({ evidenceCount, thesisCount, forensicDiffCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: 'Failed to load stats', message });
  }
});

app.use('/api/evidence', evidenceRouter);
app.use('/api/arguments', argumentRouter);
app.use('/api/chat', chatRouter);
app.use('/api/forensics', forensicsRouter);
// Level 4's marking surface. Behind requireResearcher inside the router itself,
// like the researcher routes it sits beside.
app.use('/api/article-rules', articleRulesRouter);
app.use('/api/figures', figuresRouter);
app.use('/api/mentions', mentionRouter);
app.use('/api/thesis', thesisRouter);
app.use('/api/auth', authRouter);
app.use('/api/reports', reportRouter);

// ---------------------------------------------------------------------------
// Global error handler — must be registered AFTER all routes.
// Catches anything passed to next(err) (e.g. multer rejections, unhandled
// throws in async handlers) and returns a consistent JSON body so the
// frontend never receives a plain-text "Internal Server Error".
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Defensive: err may be any value (string, object, null) — never assume it is an Error instance.
  const message = err instanceof Error ? err.message : String(err ?? 'Internal server error');
  const stack   = err instanceof Error ? err.stack : undefined;
  console.error('[server] Unhandled error:', stack ?? message);

  const anyErr = err as { status?: number; statusCode?: number } | null;
  const status = anyErr?.status ?? anyErr?.statusCode ?? 500;

  // Guard against double-send (e.g. if a middleware partially wrote headers)
  if (res.headersSent) return;
  try {
    res.status(status).json({ error: message });
  } catch {
    // Last-resort: response is already destroyed — nothing we can do
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Glass Fortress backend running on http://localhost:${PORT}`);
  console.log(`[startup] Build: ${new Date().toISOString()} | Node: ${process.version}`);

  // Semantic search degrades silently when its tables are missing — surface it here.
  void VectorStoreService.healthCheck().then((health) => {
    if (health.ok) {
      console.log('[startup] Vector store: OK');
      return;
    }
    console.error(
      `[startup] VECTOR STORE UNAVAILABLE — semantic search will return no results ` +
        `without erroring. Missing: ${health.missing.join(', ')}. ` +
        `Fix with: npx prisma migrate deploy`,
    );
  });
});

export { app };
