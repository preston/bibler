import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { prisma } from '../db/prisma.ts';
import { object } from '../ai/client.ts';
import { callTool, ToolError, toolDefinitions } from './tools.ts';
export const protocolVersion = '2024-11-05';
export function jsonRpcError(code: number, message: string, data?: unknown, id?: unknown) {
  return { jsonrpc: '2.0', error: { code, message, ...(data !== undefined ? { data } : {}) }, ...(id !== undefined && id !== null ? { id } : {}) };
}
export async function touchSession(sessionId: string, db = prisma) {
  const now = new Date();
  return db.mcpSession.upsert({ where: { sessionId }, create: { sessionId, initializedAt: now, lastActivityAt: now, createdAt: now, updatedAt: now }, update: { lastActivityAt: now } });
}
/** POST accepts the original opaque session headers; GET retains stricter UUID v4 validation. */
export function createMcpRouter(db = prisma) {
  const router = Router();
  router.post('/', async (req, res) => {
    let request: Record<string, unknown>;
    try {
      if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) request = object(JSON.parse(String(req.body)));
      else if (req.body === undefined || req.body === null) { res.status(400).json(jsonRpcError(-32700, 'Parse error', 'Empty request body')); return; }
      else request = object(req.body);
    } catch (error) { res.status(400).json(jsonRpcError(-32700, 'Parse error', error instanceof Error ? error.message : String(error))); return; }
    const id = request.id;
    const sessionId = req.get('Mcp-Session-Id') ?? randomUUID();
    const reply = (result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });
    try {
      // Ping deliberately does not create or touch a database session.
      if (request.method === 'ping') { res.set('Mcp-Session-Id', sessionId).json(reply({})); return; }
      await touchSession(sessionId, db);
      res.set('Mcp-Session-Id', sessionId);
      switch (request.method) {
        case 'initialize': res.json(reply({ protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'bibler-server', version: '1.0.0' } })); break;
        case 'tools/list': res.json(reply({ tools: toolDefinitions })); break;
        case 'tools/call': {
          const params = object(request.params);
          try { res.json(reply(await callTool(String(params.name ?? ''), object(params.arguments), db))); }
          catch (error) {
            const code = error instanceof ToolError ? error.code : -32000;
            const message = code === -32602 ? 'Invalid params' : code === -32001 ? 'Resource not found' : 'Tool execution error';
            res.json(jsonRpcError(code, message, error instanceof Error ? error.message : String(error), id));
          }
          break;
        }
        default: res.json(jsonRpcError(-32601, 'Method not found', `Unknown method: ${String(request.method ?? '')}`, id));
      }
    } catch (error) { res.status(500).json(jsonRpcError(-32603, 'Internal error', error instanceof Error ? error.message : String(error))); }
  });
  router.get('/', async (req, res) => {
    const raw = req.get('Mcp-Session-Id')?.trim() ?? '';
    if (raw && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw)) { res.status(400).json({ error: 'Invalid Mcp-Session-Id format.' }); return; }
    const sessionId = raw || randomUUID();
    await touchSession(sessionId, db);
    res.set({ 'Mcp-Session-Id': sessionId, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    res.write(`event: connected\ndata: ${JSON.stringify({ session_id: sessionId })}\n\n`);
    const keepalive = setInterval(() => { res.write(': keepalive\n\n'); }, 10_000);
    const lifetime = setTimeout(() => res.end(), 300_000);
    keepalive.unref(); lifetime.unref();
    res.once('close', () => { clearInterval(keepalive); clearTimeout(lifetime); });
  });
  return router;
}
