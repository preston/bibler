// Author: Preston Lee

import { createApp } from './app.ts';
import { bootstrap } from './db/bootstrap.ts';
import { databaseUrl, prisma } from './db/prisma.ts';

await bootstrap(databaseUrl);
const port = Number(process.env.BIBLER_SERVER_PORT ?? process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid server port.');
const server = createApp().listen(port, '0.0.0.0', () => console.log(`Bibler API listening on port ${port}`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  server.close(() => { void prisma.$disconnect().then(() => process.exit(0)); });
  setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 25_000).unref();
});
