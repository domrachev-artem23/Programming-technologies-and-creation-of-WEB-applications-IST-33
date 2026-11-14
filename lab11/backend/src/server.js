import 'dotenv/config';
import { app } from './app.js';
import { pool } from './db/pool.js';

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => console.log(`FinBuddy API is listening at http://localhost:${port}`));

async function shutdown() {
  server.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
