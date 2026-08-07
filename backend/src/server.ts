import 'dotenv/config';
import path from 'path';
import fs from 'fs';
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

const app = express();
const PORT = process.env['PORT'] ?? 3000;

// ---------------------------------------------------------------------------
// CORS — allow configured frontend origin(s) + localhost for dev
// ---------------------------------------------------------------------------

const allowedOrigins = [
  process.env['FRONTEND_URL'],          // e.g. https://glass-fortress.vercel.app
  'http://localhost:3001',              // Next.js dev default
  'http://localhost:3000',
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header) and Next.js SSR rewrites
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' is not allowed`));
    },
    credentials: true,
  }),
);

app.use(express.json());

// ---------------------------------------------------------------------------
// Uploads — serve retained evidence files (images/PDFs) at /api/uploads/
// The directory is created on startup if it doesn't exist.
// ---------------------------------------------------------------------------

export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/api/uploads', express.static(UPLOADS_DIR));

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'Glass Fortress Backend is Alive' });
});

app.use('/api/evidence', evidenceRouter);
app.use('/api/arguments', argumentRouter);
app.use('/api/chat', chatRouter);

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
});

export { app };
