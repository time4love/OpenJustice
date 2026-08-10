import express from 'express';

const app = express();
const PORT = process.env.PORT ?? 3002;

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'bronze-fortress-backend' });
});

app.listen(PORT, () => {
  console.log(`Bronze Fortress backend running on port ${PORT}`);
});

export { app };
