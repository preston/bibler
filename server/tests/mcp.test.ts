import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { prisma } from '../src/db/prisma.ts';
import { callTool, toolDefinitions, searchTerms } from '../src/mcp/tools.ts';
import { createMcpRouter } from '../src/mcp/router.ts';
const bibleId = '00000000-0000-4000-8000-000000000001', bookId = '00000000-0000-4000-8000-000000000002';
const bible = { id: bibleId, name: 'Database Bible', abbreviation: 'DB', language: 'en', license: 'Test' };
const book = { id: bookId, bibleId, name: 'Genesis', ordinal: 1, testament: 'old' };
const verse = { id: '00000000-0000-4000-8000-000000000003', bibleId, bookId, chapter: 1, ordinal: 1, text: 'Database scripture.' };
const sessions: string[] = [];
function mockDb() {
  return { bible: { findMany: async () => [bible], findFirst: async ({ where }: { where: { id?: string } }) => where.id === bibleId ? bible : null },
    book: { findMany: async () => [book], findFirst: async ({ where }: { where: { id?: string; bibleId?: string } }) => where.id === bookId && where.bibleId === bibleId ? book : null },
    verse: { findMany: async () => [verse], findFirst: async ({ where }: { where: { ordinal: number } }) => where.ordinal === 1 ? verse : null },
    mcpSession: { upsert: async ({ where }: { where: { sessionId: string } }) => { sessions.push(where.sessionId); return { sessionId: where.sessionId }; } },
    $queryRaw: async () => [{ ...verse, name: book.name }]
  } as unknown as typeof prisma;
}
async function serve(run: (base: string) => Promise<void>) {
  const app = express(); app.use('/mcp', express.text({ type: '*/*' }), createMcpRouter(mockDb()));
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`); } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}
const decode = (result: Awaited<ReturnType<typeof callTool>>) => JSON.parse(result.content[0]!.text) as Record<string, unknown>;
test('MCP exposes the same seven tools, order, definitions and snake_case names', () => {
  assert.deepEqual(toolDefinitions.map(t => t.name), ['search_verses', 'get_verse', 'get_chapter', 'list_books', 'list_bibles', 'get_book_info', 'list_languages']);
  assert.deepEqual(toolDefinitions[1]!.inputSchema.required, ['bible', 'book', 'chapter', 'verse']);
  assert.equal(searchTerms("God's love"), "' God s ':* | ' love ':*");
  assert.equal(searchTerms('  God-ward\tfaith  '), "' God-ward ':* | ' faith ':*");
});
test('all seven MCP tools return database text with unchanged argument/result casing', async () => {
  const db = mockDb();
  const translated = decode(await callTool('list_bibles', {}, db)) as unknown as Array<Record<string, unknown>>;
  assert.equal(translated[0]!.uuid, bibleId);
  assert.deepEqual(decode(await callTool('list_languages', {}, db)), [{ code: 'en', name: 'English' }]);
  assert.equal((decode(await callTool('list_books', { bible: bibleId }, db)) as unknown as Array<Record<string, unknown>>)[0]!.testament, 'old');
  const info = decode(await callTool('get_book_info', { bible: bibleId, book: bookId }, db)); assert.equal(info.chapter_count, 1); assert.equal(info.chapterCount, undefined);
  const specific = decode(await callTool('get_verse', { bible: bibleId, book: bookId, chapter: 1, verse: 1 }, db)); assert.equal(specific.reference, 'Genesis 1:1'); assert.equal(specific.text, verse.text);
  const chapter = decode(await callTool('get_chapter', { bible: bibleId, book: bookId, chapter: 1 }, db)); assert.deepEqual(chapter.verses, [{ verse: 1, text: verse.text }]);
  const search = decode(await callTool('search_verses', { bible: bibleId, query: 'scripture' }, db)) as unknown as Array<Record<string, unknown>>; assert.equal(search[0]!.text, verse.text);
});
test('MCP separates validation errors, unknown tools and scoped resource lookup failures', async () => {
  const db = mockDb();
  await assert.rejects(() => callTool('unknown', {}, db), /Unknown tool/);
  await assert.rejects(() => callTool('get_verse', {}, db), /bible is required/);
  await assert.rejects(() => callTool('get_verse', { bible: bibleId, book: 'other-bible-book', chapter: 1, verse: 1 }, db), /Book not found/);
  await assert.rejects(() => callTool('get_verse', { bible: bibleId, book: bookId, chapter: 1, verse: 999 }, db), /Verse not found: Genesis 1:999/);
});
test('JSON-RPC preserves protocol version, persistent session headers, ping fast path and error codes', async () => {
  sessions.length = 0;
  await serve(async base => {
    const post = (body: unknown, session?: string) => fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session ? { 'Mcp-Session-Id': session } : {}) }, body: JSON.stringify(body) });
    const initial = await post({ jsonrpc: '2.0', id: 1, method: 'initialize' });
    const session = initial.headers.get('Mcp-Session-Id')!;
    assert.match(session, /^[0-9a-f-]{36}$/); assert.equal((await initial.json()).result.protocolVersion, '2024-11-05');
    const tools = await post({ id: 2, method: 'tools/list' }, session); assert.equal(tools.headers.get('Mcp-Session-Id'), session); assert.equal((await tools.json()).result.tools.length, 7);
    assert.deepEqual(sessions, [session, session]);
    const ping = await post({ id: 0, method: 'ping' }, session); assert.deepEqual(await ping.json(), { jsonrpc: '2.0', id: 0, result: {} }); assert.equal(sessions.length, 2);
    const unknown = await post({ id: 3, method: 'tools/call', params: { name: 'unknown' } }); assert.equal((await unknown.json()).error.code, -32602);
    const missing = await post({ id: 4, method: 'tools/call', params: { name: 'get_verse', arguments: { bible: 'missing', book: bookId, chapter: 1, verse: 1 } } }); assert.equal((await missing.json()).error.code, -32001);
    const invalidMethod = await post({ id: 5, method: 'undefined' }); assert.equal((await invalidMethod.json()).error.code, -32601);
    const malformed = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{broken' }); assert.equal(malformed.status, 400); assert.equal((await malformed.json()).error.code, -32700);
  });
});
test('SSE validates session IDs and immediately announces unchanged session_id payload', async () => {
  await serve(async base => {
    const invalid = await fetch(base, { headers: { 'Mcp-Session-Id': 'not-a-uuid' } }); assert.equal(invalid.status, 400);
    const controller = new AbortController();
    const response = await fetch(base, { headers: { 'Mcp-Session-Id': bibleId }, signal: controller.signal });
    assert.equal(response.headers.get('Mcp-Session-Id'), bibleId); assert.match(response.headers.get('content-type')!, /text\/event-stream/);
    const reader = response.body!.getReader(), first = await reader.read();
    assert.equal(new TextDecoder().decode(first.value), `event: connected\ndata: {"session_id":"${bibleId}"}\n\n`);
    controller.abort(); await reader.cancel().catch(() => undefined);
  });
});
