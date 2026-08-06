import 'dotenv/config';
import express, { Request, Response } from 'express';
import cors from 'cors';
import { evidenceRouter } from './routes/evidenceRoutes';
import { argumentRouter } from './routes/argumentRoutes';

const app = express();
const PORT = process.env['PORT'] ?? 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(cors());
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
