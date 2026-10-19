import express from 'express';
import { prisma } from './db/prisma.ts';
import { authenticate } from './auth/access.ts';
import { errorHandler } from './http.ts';
import { createScriptureRouter } from './routes/scripture.ts';
import { createSystemRouter } from './routes/system.ts';
import { createStudiesRouter } from './routes/studies.ts';
import { createSermonsRouter } from './routes/sermons.ts';
import { createDocumentsRouter } from './routes/documents.ts';
import { createAiRouter } from './ai/router.ts';
import { createMcpRouter } from './mcp/router.ts';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const allowed = process.env.BIBLER_CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean) ?? ['*'];
    const origin = req.header('origin');
    if (allowed.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
    else if (origin && allowed.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.vary('Origin'); }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept, MCP-Session-Id, MCP-Protocol-Version, Last-Event-ID');
    res.setHeader('Access-Control-Expose-Headers', 'MCP-Session-Id, MCP-Protocol-Version, Last-Event-ID');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    next();
  });
  app.use('/mcp', express.text({ type: 'application/json', limit: process.env.BIBLER_JSON_LIMIT || '20mb' }), authenticate, createMcpRouter());
  app.use(express.json({ limit: process.env.BIBLER_JSON_LIMIT || '20mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.get('/health', async (_req, res) => {
    try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok' }); }
    catch { res.status(503).json({ status: 'unavailable' }); }
  });
  app.use('/api', authenticate, createScriptureRouter(), createSystemRouter(), createStudiesRouter(), createSermonsRouter(), createDocumentsRouter(), createAiRouter());
  app.use((_req, res) => res.status(404).json({ error: 'Resource not found.' }));
  app.use(errorHandler);
  return app;
}
