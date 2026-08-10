import express from 'express';

const app = express();
const PORT = process.env.PORT ?? 3002;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'closed-doors-backend' });
});

app.listen(PORT, () => {
  console.log(`Closed Doors backend running on port ${PORT}`);
});

export { app };
