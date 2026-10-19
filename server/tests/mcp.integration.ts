import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Client } from 'pg';
import { bootstrap } from '../src/db/bootstrap.ts';

const base = process.env.BIBLER_SERVER_TEST_DATABASE_URL;
if (process.env.CI && !base) throw new Error('CI requires BIBLER_SERVER_TEST_DATABASE_URL.');
if (base && !new URL(base).pathname.slice(1).startsWith('bibler_test')) throw new Error('Integration database name must start with bibler_test.');

test('REST, AI and MCP searches preserve pg_search matching, relevance and UUID ordering', { skip: !base }, async (t) => {
  const database = `bibler_test_mcp_${randomUUID().replaceAll('-', '')}`;
  const admin = new Client({ connectionString: base });
  await admin.connect();
  let created = false;
  let db: typeof import('../src/db/prisma.ts').prisma | undefined;
  let server: Server | undefined;
  try {
    await admin.query(`CREATE DATABASE "${database}"`); created = true;
    const url = new URL(base!); url.pathname = `/${database}`;
    await bootstrap(url.toString());
    process.env.BIBLER_SERVER_DATABASE_URL = url.toString();
    db = (await import('../src/db/prisma.ts')).prisma;
    const { callTool } = await import('../src/mcp/tools.ts');
    const now = new Date();
    const bible = await db.bible.create({ data: { name: 'King James Version', abbreviation: 'KJV', language: 'en', license: 'Public domain', createdAt: now, updatedAt: now } });
    const genesis = await db.book.create({ data: { id: '00000000-0000-4000-8000-000000000001', bibleId: bible.id, name: 'Genesis', ordinal: 1, testament: 'old', createdAt: now, updatedAt: now } });
    const revelation = await db.book.create({ data: { id: '00000000-0000-4000-8000-000000000002', bibleId: bible.id, name: 'Revelation of John', ordinal: 27, testament: 'new', createdAt: now, updatedAt: now } });
    const exodus = await db.book.create({ data: { id: '00000000-0000-4000-8000-000000000003', bibleId: bible.id, name: 'Exodus', ordinal: 2, testament: 'old', createdAt: now, updatedAt: now } });
    // Exact public-domain source: bible_databases/formats/csv/KJV.csv, Genesis 1:1–2, Revelation of John 21:1 and Exodus 18:19.
    const fixtures = [
      { id: '00000000-0000-4000-8000-000000000011', bookId: genesis.id, chapter: 1, ordinal: 2, text: 'And the earth was without form and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.' },
      { id: '00000000-0000-4000-8000-000000000012', bookId: genesis.id, chapter: 1, ordinal: 1, text: 'In the beginning God created the heaven and the earth.' },
      { id: '00000000-0000-4000-8000-000000000013', bookId: revelation.id, chapter: 21, ordinal: 1, text: 'And I saw a new heaven and a new earth: for the first heaven and the first earth were passed away; and there was no more sea.' },
      { id: '00000000-0000-4000-8000-000000000014', bookId: exodus.id, chapter: 18, ordinal: 19, text: 'Hearken now unto my voice, I will give thee counsel, and God shall be with thee: Be thou for the people to God-ward, that thou mayest bring the causes unto God:' },
    ];
    await db.verse.createMany({ data: fixtures.map(row => ({ ...row, bibleId: bible.id, createdAt: now, updatedAt: now })) });
    const top = JSON.parse((await callTool('search_verses', { bible: bible.id, query: 'earth', limit: 1 }, db)).content[0]!.text) as Array<{ reference: string; text: string }>;
    assert.equal(top[0]?.reference, 'Revelation of John 21:1'); assert.equal(top[0]?.text, fixtures[2]!.text);
    const all = JSON.parse((await callTool('search_verses', { bible: bible.id, query: 'earth' }, db)).content[0]!.text) as Array<{ reference: string }>;
    assert.deepEqual(all.map(row => row.reference), ['Revelation of John 21:1', 'Genesis 1:2', 'Genesis 1:1']);
    const { searchScripture } = await import('../src/ai/study.ts');
    const { createApp } = await import('../src/app.ts');
    server = createServer(createApp());
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    for (const entry of [
      { label: 'apostrophes stay inside a single phrase term', query: "God's", expected: [fixtures[3]!] },
      { label: 'hyphens preserve compound matching', query: 'God-ward', expected: [fixtures[3]!] },
      { label: 'ordinary prefixes match longer words', query: 'beginn', expected: [fixtures[1]!] },
      { label: 'whitespace-separated words keep OR matching', query: 'beginn earth', expected: fixtures.slice(0, 3) },
    ]) await t.test(entry.label, async () => {
      const expectedIds = entry.expected.map(row => row.id).sort();
      const expectedText = entry.expected.map(row => row.text).sort();
      const mcp = JSON.parse((await callTool('search_verses', { bible: bible.id, query: entry.query }, db)).content[0]!.text) as Array<{ text: string }>;
      assert.deepEqual(mcp.map(row => row.text).sort(), expectedText);
      const ai = await searchScripture([{ bible_uuid: bible.id, text: entry.query, limit: 25 }], db);
      assert.deepEqual(ai.errors, []); assert.deepEqual(ai.verses.map(row => row.verse_uuid).sort(), expectedIds);
      const response = await fetch(`${origin}/api/bibles/${bible.id}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: entry.query }) });
      assert.equal(response.status, 200);
      const rest = await response.json() as Array<{ uuid: string; text: string }>;
      assert.deepEqual(rest.map(row => row.uuid).sort(), expectedIds); assert.deepEqual(rest.map(row => row.text).sort(), expectedText);
    });
  } finally {
    if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server!.close(() => resolve())); }
    await db?.$disconnect();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    await admin.end();
  }
});
