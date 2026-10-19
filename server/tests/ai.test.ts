import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Study } from '@prisma/client';
import { prisma } from '../src/db/prisma.ts';
import { OllamaClient, camelize, parseResponseJson, type Chat } from '../src/ai/client.ts';
import { normalizeContext, contextJson } from '../src/ai/prompts.ts';
import { normalizeSearches, normalizeSuggestions, referenceBibles, scaleDurations, studyAssistant } from '../src/ai/study.ts';
import { sermonOutlinePass, sermonVersePass } from '../src/ai/sermon.ts';
import { createAiRouter } from '../src/ai/router.ts';
const bibleId = '00000000-0000-4000-8000-000000000001', verseId = '00000000-0000-4000-8000-000000000002';
const bible = { id: bibleId, name: 'Database Bible', language: 'en', abbreviation: 'DB', aiDefaultEnglish: true };
const greek = { id: '00000000-0000-4000-8000-000000000003', name: 'Greek', language: 'grc', aiDefaultGreek: true };
const study = { id: '00000000-0000-4000-8000-000000000004', title: 'Study', goal: 'Love', visibility: 'public', ownerId: null } as Study;
function mockDb() {
  return { bible: { findMany: async () => [bible, greek], findFirst: async () => bible },
    verse: { findMany: async () => [], findFirst: async () => ({ id: verseId, bibleId, bookId: 'book', chapter: 1, ordinal: 1, text: 'Database scripture.' }) },
    study: { findFirst: async () => study },
    studyVerse: { findMany: async () => [] }, studyCommentary: { findMany: async () => [] }, studyQuestion: { findMany: async () => [] }, studyTask: { findMany: async () => [] }, studyPlanItem: { findMany: async () => [] },
    $queryRaw: async () => [{ id: verseId, book_id: 'book', name: 'Genesis', chapter: 1, ordinal: 1, text: 'Database scripture.' }]
  } as unknown as typeof prisma;
}
const configured = () => { process.env.BIBLER_SERVER_OLLAMA_URL = 'http://ollama.invalid'; };
async function serve(chat: Chat, run: (base: string) => Promise<void>) {
  const app = express(); app.use(express.json()); app.use('/api', createAiRouter({ chat, db: mockDb() }));
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
}

test('context preserves comparator chapters while enforcing generic limits and environment overrides', () => {
  assert.equal((normalizeContext(Array.from({ length: 30 }, (_, i) => i)) as unknown[]).length, 26);
  assert.equal((normalizeContext(Array.from({ length: 150 }, (_, i) => i), true) as unknown[]).length, 150);
  process.env.BIBLER_SERVER_OLLAMA_MAX_CONTEXT_CHARS = '20';
  try { assert.match(contextJson({ body: 'x'.repeat(100) }), /truncated/); } finally { delete process.env.BIBLER_SERVER_OLLAMA_MAX_CONTEXT_CHARS; }
});
test('JSON output parsing handles fences, wrappers and double encoding without losing refusal prose', () => {
  assert.deepEqual(parseResponseJson('```json\n{"verses":[]}\n```'), { verses: [] });
  assert.deepEqual(parseResponseJson(JSON.stringify('{"suggestions":[]}')), { suggestions: [] });
  assert.equal(parseResponseJson('I do not know.'), null);
  assert.deepEqual(camelize({ task_type: 'in_progress', verse_uuid: verseId }), { taskType: 'in_progress', verseUuid: verseId });
});
test('Ollama preserves UTF-8 across arbitrary NDJSON chunks, including final line with no newline', async () => {
  configured();
  const bytes = new TextEncoder().encode('{"message":{"content":"ἀγάπη"}}\n{"model":"test","message":{"content":" love"},"done":true}');
  const body = new ReadableStream<Uint8Array>({ start(controller) { for (let i = 0; i < bytes.length; i += 3) controller.enqueue(bytes.slice(i, i + 3)); controller.close(); } });
  let payload: Record<string, unknown> = {};
  const client = new OllamaClient(async (_url, options) => { payload = JSON.parse(String(options?.body)); return new Response(body); });
  const deltas: string[] = [], result = await client.run({ system: 'rules', user: 'request', stream: true, format: 'json', onDelta: value => deltas.push(value) });
  assert.equal(result.output, 'ἀγάπη love'); assert.deepEqual(deltas, ['ἀγάπη', 'ἀγάπη love']);
  assert.equal(payload.format, 'json'); assert.equal((payload.options as Record<string, unknown>).num_ctx, 131072);
});
test('Ollama returns structured HTTP/NDJSON errors and cancels an active response on disconnection', async () => {
  configured();
  const failed = await new OllamaClient(async () => new Response('{"error":"unavailable"}', { status: 503 })).run({ system: '', user: '' });
  assert.match(failed.error!, /503/);
  const badStream = await new OllamaClient(async () => new Response('{"error":"model disappeared"}\n')).run({ system: '', user: '', stream: true });
  assert.match(badStream.error!, /model disappeared/);
  const controller = new AbortController();
  const client = new OllamaClient(async (_url, options) => new Promise((_resolve, reject) => { options?.signal?.addEventListener('abort', () => reject(new Error('aborted'))); controller.abort(); }));
  assert.match((await client.run({ system: '', user: '', signal: controller.signal })).error!, /cancelled/);
});
async function provider(handler: (request: IncomingMessage, response: ServerResponse) => void, settings: Record<string, string>, run: () => Promise<void>) {
  const server = createServer(handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const values = { BIBLER_SERVER_OLLAMA_URL: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, BIBLER_SERVER_OLLAMA_RETRIES: '0', ...settings };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { await run(); }
  finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
test('non-streaming generation may delay headers beyond the open/write deadlines while honoring the read budget', async () => {
  await provider((request, response) => {
    request.resume();
    request.on('end', () => {
      const timer = setTimeout(() => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ model: 'test', message: { content: 'Generation completed.' } })); }, 1200);
      response.once('close', () => clearTimeout(timer));
    });
  }, { BIBLER_SERVER_OLLAMA_OPEN_TIMEOUT: '1', BIBLER_SERVER_OLLAMA_WRITE_TIMEOUT: '0', BIBLER_SERVER_OLLAMA_READ_TIMEOUT: '3' }, async () => {
    const started = Date.now();
    const result = await new OllamaClient().run({ system: 'Test transport only.', user: 'Return a status.' });
    assert.equal(result.error, undefined, JSON.stringify(result)); assert.equal(result.output, 'Generation completed.'); assert.ok(Date.now() - started >= 1100);
  });
});
test('read timeout covers stalled headers and response bodies with the configured read error', async () => {
  for (const stall of ['headers', 'body'] as const) {
    await provider((request, response) => {
      request.resume();
      request.on('end', () => {
        if (stall === 'body') { response.setHeader('Content-Type', 'application/json'); response.write('{"model":"test","message":{"content":"'); }
        const timer = setTimeout(() => { if (stall === 'headers') response.end('{"message":{"content":"Late"}}'); else response.end('Late"}}'); }, 1800);
        response.once('close', () => clearTimeout(timer));
      });
    }, { BIBLER_SERVER_OLLAMA_OPEN_TIMEOUT: '3', BIBLER_SERVER_OLLAMA_WRITE_TIMEOUT: '0', BIBLER_SERVER_OLLAMA_READ_TIMEOUT: '1' }, async () => {
      const result = await new OllamaClient().run({ system: 'Test transport only.', user: 'Return a status.' });
      assert.match(result.error ?? '', /request timed out after 1s/); assert.match(result.hint ?? '', /BIBLER_SERVER_OLLAMA_READ_TIMEOUT/);
    });
  }
});
test('read deadlines reset on body activity for JSON and NDJSON streams longer than one read interval', async () => {
  for (const stream of [false, true]) {
    await provider((request, response) => {
      request.resume();
      request.on('end', () => {
        response.setHeader('Content-Type', stream ? 'application/x-ndjson' : 'application/json');
        const chunks = stream ? ['{"message":{"content":"One"}}\n', '{"message":{"content":" two"}}\n', '{"message":{"content":" three"}}\n', '{"model":"test","done":true}\n'] : ['{"model":"test",', '"message":{', '"content":"One two three"', '}}'];
        let index = 0;
        response.write(chunks[index++]!);
        const timer = setInterval(() => { response.write(chunks[index++]!); if (index === chunks.length) { clearInterval(timer); response.end(); } }, 400);
        response.once('close', () => clearInterval(timer));
      });
    }, { BIBLER_SERVER_OLLAMA_OPEN_TIMEOUT: '1', BIBLER_SERVER_OLLAMA_WRITE_TIMEOUT: '0', BIBLER_SERVER_OLLAMA_READ_TIMEOUT: '1', BIBLER_SERVER_OLLAMA_STREAM_READ_TIMEOUT: '1' }, async () => {
      const started = Date.now(), result = await new OllamaClient().run({ system: 'Test transport only.', user: 'Return a status.', stream });
      assert.equal(result.error, undefined, JSON.stringify(result)); assert.equal(result.output, 'One two three'); assert.ok(Date.now() - started >= 1100);
    });
  }
});
test('database planning constrains reference scopes and normalizes durations and task enums', async () => {
  const db = mockDb();
  assert.equal((await referenceBibles('Love', db)).length, 1);
  assert.equal((await referenceBibles('Greek word for love', db)).length, 2);
  assert.deepEqual(normalizeSearches([{ bible_uuid: 'invented', text: 'faith' }, { text: ' love ', limit: 300 }], [{ uuid: bibleId }]), [{ bible_uuid: bibleId, text: 'love', limit: 25 }]);
  const suggestions = await normalizeSuggestions([{ type: 'add_task', payload: { task_type: 'planning' } }, { type: 'ADD-TASK', payload: { task_type: 'reading', status: 'in-progress' }, duration: '9' }, { type: 'add_verse', payload: { verse_uuid: 'invented' } }], db);
  assert.equal(suggestions.length, 1); assert.equal((suggestions[0]!.payload as Record<string, unknown>).status, 'in_progress');
  const allocations = [{ duration: 1 }, { duration: 3 }, { duration: 7 }]; scaleDurations(allocations, 60);
  assert.equal(allocations.reduce((sum, s) => sum + s.duration, 0), 60);
});
test('study assistant completes two database-grounded rounds and emits contract lifecycle events', async () => {
  const calls: string[] = [], events: string[] = [];
  const chat: Chat = { run: async input => { calls.push(input.user); return { output: calls.length === 1 ? JSON.stringify({ searches: [{ bible_uuid: bibleId, text: 'love' }] }) : JSON.stringify({ suggestions: [{ type: 'add_verse', title: 'Read', payload: { verse_uuid: verseId }, duration: 3 }, { type: 'add_question', title: 'Discuss', payload: { prompt: 'How can we apply this?' }, duration: 2 }] }) }; } };
  const result = await studyAssistant(study, 'Study love', { chat, db: mockDb(), stream: true, emit: event => events.push(event), target: 30 });
  assert.equal(calls.length, 2); assert.match(calls[1]!, /Database scripture\./);
  assert.deepEqual(events, ['started', 'status', 'plan', 'status', 'search_results', 'status', 'complete']);
  assert.equal((result.suggestions as Array<{ duration: number }>).reduce((sum, s) => sum + s.duration, 0), 30);
});
test('SSE exposes camelCase data, preserves event names, and sends provider errors', async () => {
  const chat: Chat = { run: async () => ({ error: 'Ollama unavailable' }) };
  await serve(chat, async base => {
    const response = await fetch(`${base}/api/studies/${study.id}/ai/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ message: 'Love' }) });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type')!, /text\/event-stream/);
    const body = await response.text(); assert.match(body, /event: started/); assert.match(body, /event: error\ndata: .*Ollama unavailable/);
  });
});
test('SSE wall-clock deadline aborts the in-flight Ollama generation and closes the stream', async () => {
  process.env.BIBLER_ASSISTANT_SSE_MAX_SECONDS = '0';
  let aborted = false;
  const chat: Chat = { run: async input => new Promise(resolve => { input.signal?.addEventListener('abort', () => { aborted = true; resolve({ error: 'cancelled' }); }); }) };
  try {
    await serve(chat, async base => {
      const response = await fetch(`${base}/api/studies/${study.id}/ai/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ message: 'Love' }) });
      assert.match(await response.text(), /Assistant stream timed out/); assert.equal(aborted, true);
    });
  } finally { delete process.env.BIBLER_ASSISTANT_SSE_MAX_SECONDS; }
});
test('sermon manuscript generation uses persisted section verses, full text, and long-form token budget', async () => {
  const db = mockDb(), calls: Array<Record<string, unknown>> = [];
  Object.assign(db, { sermonSection: { findMany: async () => [{ id: 'section', title: 'Love', estimatedMinutes: 5, sermonSectionVerses: [{ verseUuid: verseId, bibleUuid: bibleId, bookUuid: 'book', chapter: 1, ordinal: 1, verseText: 'Fallback scripture.' }] }] } });
  const chat: Chat = { run: async input => { calls.push(input); return { output: '```text\nFull spoken manuscript.\n```' }; } };
  const result = await sermonOutlinePass({ id: 'sermon', title: 'Love', userId: 'owner', visibility: 'private', targetDurationMinutes: 10 } as never, 'Explain love', { chat, db });
  const sections = result.sections as Array<Record<string, unknown>>;
  assert.equal(sections[0]!.body, 'Full spoken manuscript.'); assert.equal(sections[0]!.estimated_minutes, 10);
  assert.match(String(calls[0]!.user), /MINIMUM_BODY_CHARACTER_COUNT: 4500/); assert.match(String(calls[0]!.user), /Fallback scripture/);
  assert.equal((calls[0]!.options as Record<string, unknown>).num_predict, 19192);
});
test('SSE success preserves event labels and enums while converting every DTO key to camelCase', async () => {
  let round = 0;
  const chat: Chat = { run: async () => ({ output: ++round === 1 ? JSON.stringify({ searches: [{ bible_uuid: bibleId, text: 'love' }] }) : JSON.stringify({ suggestions: [{ type: 'add_question', payload: { question_type: 'discussion', guidance_notes: 'Read carefully.' } }] }) }) };
  await serve(chat, async base => {
    const response = await fetch(`${base}/api/studies/${study.id}/ai/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ message: 'Love', targetDurationMinutes: 30 }) });
    const body = await response.text();
    assert.match(body, /event: search_results/); assert.match(body, /"verseCount":1/); assert.match(body, /"bibleUuid"/);
    assert.match(body, /event: complete/); assert.match(body, /"questionType":"discussion"/); assert.match(body, /"type":"add_question"/); assert.match(body, /"duration":30/);
    assert.doesNotMatch(body, /"verse_count"|"bible_uuid"|"guidance_notes"/);
  });
});
test('SSE client disconnect aborts in-flight generation immediately', async () => {
  let wasAborted = false;
  const chat: Chat = { run: async input => new Promise(resolve => { input.signal?.addEventListener('abort', () => { wasAborted = true; resolve({ error: 'Cancelled.' }); }); }) };
  await serve(chat, async base => {
    const controller = new AbortController();
    const response = await fetch(`${base}/api/studies/${study.id}/ai/assistant`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify({ message: 'Love' }) });
    const reader = response.body!.getReader(); await reader.read(); controller.abort(); await reader.cancel().catch(() => undefined);
    for (let i = 0; i < 20 && !wasAborted; i++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(wasAborted, true);
  });
});
test('malformed REST identifiers return contract errors before querying PostgreSQL', async () => {
  await serve({ run: async () => { throw new Error('Must not generate'); } }, async base => {
    const invalidStudy = await fetch(`${base}/api/studies/not-a-uuid/ai/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); assert.equal(invalidStudy.status, 404);
    const invalidComparator = await fetch(`${base}/api/ai/comparator-commentary`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ primaryBibleUuid: 'bad', secondaryBibleUuid: bibleId }) }); assert.equal(invalidComparator.status, 422);
  });
});
test('sermon verse pass atomically replaces sections and persists only database scripture with exact timing', async () => {
  const db = mockDb(), mutations: string[] = [], writtenVerses: Array<Record<string, unknown>> = [], writtenSections: Array<Record<string, unknown>> = [];
  Object.assign(db, {
    document: { findMany: async (query: { where: { userId: string } }) => { assert.equal(query.where.userId, 'owner'); return [{ id: 'document', originalFilename: 'Notes', extractedText: 'User notes.' }]; } },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => run({
      sermonSection: { findMany: async () => [{ id: 'old-section' }], deleteMany: async () => { mutations.push('sections deleted'); }, create: async ({ data }: { data: Record<string, unknown> }) => { mutations.push('section created'); writtenSections.push(data); return { id: `section-${writtenSections.length}`, ...data }; } },
      sermonSectionVerse: { deleteMany: async () => { mutations.push('verses deleted'); }, create: async ({ data }: { data: Record<string, unknown> }) => { writtenVerses.push(data); return { id: `verse-${writtenVerses.length}`, ...data }; } }
    })
  });
  let round = 0;
  const chat: Chat = { run: async input => {
    if (++round === 1) return { output: JSON.stringify({ searches: [{ bible_uuid: bibleId, text: 'love' }] }) };
    assert.match(input.user, /User notes/); assert.match(input.user, /Database scripture/);
    return { output: JSON.stringify({ sections: [{ title: 'Read', estimated_minutes: 3, verse_uuids: [verseId, 'fabricated-verse'] }, { title: 'Apply', estimated_minutes: 2, verse_uuids: [verseId] }] }) };
  } };
  const result = await sermonVersePass({ id: 'sermon', title: 'Love', userId: 'owner', visibility: 'private', targetDurationMinutes: 20 } as never, 'Teach love', { chat, db, documents: ['document'] });
  assert.equal(result.error, undefined); assert.deepEqual(mutations, ['verses deleted', 'sections deleted', 'section created', 'section created']);
  assert.equal(writtenVerses.length, 2); assert.ok(writtenVerses.every(v => v.verseUuid === verseId && v.verseText === 'Database scripture.'));
  assert.deepEqual(writtenSections.map(s => s.estimatedMinutes), [12, 8]);
});
