import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { evidenceRouter } from './routes/evidenceRoutes';
import { argumentRouter } from './routes/argumentRoutes';

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
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'Glass Fortress Backend is Alive' });
});

app.use('/api/evidence', evidenceRouter);
app.use('/api/arguments', argumentRouter);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Glass Fortress backend running on http://localhost:${PORT}`);
});

export { app };
