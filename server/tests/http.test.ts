import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.ts';
import { prisma } from '../src/db/prisma.ts';

async function serve(run: (origin: string) => Promise<void>) {
  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try { await run(origin); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
}

test('REST malformed JSON uses HTTP errors while MCP retains its JSON-RPC parse errors and ping channel', async () => {
  await serve(async (origin) => {
    const rest = await fetch(`${origin}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(rest.status, 400); assert.deepEqual(await rest.json(), { error: 'Invalid JSON.' });
    const mcp = await fetch(`${origin}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(mcp.status, 400); assert.equal((await mcp.json()).error.code, -32700);
    const ping = await fetch(`${origin}/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'opaque-existing-session' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'ping', id: 0 }) });
    assert.equal(ping.status, 200); assert.equal(ping.headers.get('Mcp-Session-Id'), 'opaque-existing-session'); assert.deepEqual(await ping.json(), { jsonrpc: '2.0', id: 0, result: {} });
  });
});
test('CORS exposes protocol headers and honors explicit origins', async () => {
  const previous = process.env.BIBLER_CORS_ORIGINS; process.env.BIBLER_CORS_ORIGINS = 'https://bibler.example';
  try {
    await serve(async (origin) => {
      const response = await fetch(`${origin}/api/session`, { method: 'OPTIONS', headers: { Origin: 'https://bibler.example', 'Access-Control-Request-Headers': 'Authorization, MCP-Session-Id' } });
      assert.equal(response.status, 204); assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://bibler.example'); assert.match(response.headers.get('Access-Control-Expose-Headers') ?? '', /MCP-Session-Id/); assert.match(response.headers.get('Vary') ?? '', /Origin/);
      const disallowed = await fetch(`${origin}/api/session`, { method: 'OPTIONS', headers: { Origin: 'https://elsewhere.example' } }); assert.equal(disallowed.headers.get('Access-Control-Allow-Origin'), null);
    });
  } finally { if (previous === undefined) delete process.env.BIBLER_CORS_ORIGINS; else process.env.BIBLER_CORS_ORIGINS = previous; }
});
test('oversized JSON is rejected with 413 and unknown routes with 404', async () => {
  const previous = process.env.BIBLER_JSON_LIMIT; process.env.BIBLER_JSON_LIMIT = '16b';
  try {
    await serve(async (origin) => {
      const response = await fetch(`${origin}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'a'.repeat(100) }) }); assert.equal(response.status, 413); assert.deepEqual(await response.json(), { error: 'Request body is too large.' });
      const missing = await fetch(`${origin}/unknown`); assert.equal(missing.status, 404);
    });
  } finally { if (previous === undefined) delete process.env.BIBLER_JSON_LIMIT; else process.env.BIBLER_JSON_LIMIT = previous; }
});
test('health is available only while the database can answer queries', async () => {
  const query = prisma.$queryRaw;
  prisma.$queryRaw = (async () => [{ value: 1 }]) as unknown as typeof prisma.$queryRaw;
  try {
    await serve(async (origin) => {
      assert.equal((await fetch(`${origin}/health`)).status, 200);
      prisma.$queryRaw = (async () => { throw new Error('Database unavailable.'); }) as unknown as typeof prisma.$queryRaw;
      const unavailable = await fetch(`${origin}/health`); assert.equal(unavailable.status, 503); assert.deepEqual(await unavailable.json(), { status: 'unavailable' });
    });
  } finally { prisma.$queryRaw = query; }
});
