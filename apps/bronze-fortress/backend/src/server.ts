import express, { Request, Response, NextFunction } from 'express';
import { mcpRouter } from './mcp/mcpRoutes';
import { caseRouter } from './routes/caseRoutes';
import { figureRouter } from './routes/figureRoutes';

process.on('uncaughtException', (err: Error) => {
  console.error('[Fatal] uncaughtException — stack follows:');
  console.error(err.stack ?? err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[Fatal] unhandledRejection — reason follows:');
  if (reason instanceof Error) {
    console.error(reason.stack ?? reason.message);
  } else {
    console.error(reason);
  }
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.error('[Shutdown] SIGTERM received — process terminating');
  process.exit(0);
});

const app = express();
const PORT = process.env.PORT ?? 3002;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'bronze-fortress-backend' });
});

app.use('/api/mcp', mcpRouter);
app.use('/api/cases', caseRouter);
app.use('/api/figures', figureRouter);

// Global error handler — must be last. Catches errors forwarded via next(err).
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server] Unhandled error:', err.stack ?? err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Bronze Fortress backend running on port ${PORT}`);
  });
}

export { app };
