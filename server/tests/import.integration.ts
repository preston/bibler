import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { bootstrap } from '../src/db/bootstrap.ts';

const base = process.env.BIBLER_SERVER_TEST_DATABASE_URL;
if (process.env.CI && !base) throw new Error('CI requires BIBLER_SERVER_TEST_DATABASE_URL.');
if (base && !new URL(base).pathname.slice(1).startsWith('bibler_test')) throw new Error('Integration database name must start with bibler_test.');
const database = `bibler_test_import_${randomUUID().replaceAll('-', '')}`;
let created = false;
let fixture = '';
let client: Client;
let db: typeof import('../src/db/prisma.ts').prisma;
let importBibles: typeof import('../src/db/import.ts').importBibles;
// Exact source: bible_databases/formats/csv/KJV.csv, Genesis 1:1.
const scripture = 'In the beginning God created the heaven and the earth.';

before(async () => {
  if (!base) return;
  const admin = new Client({ connectionString: base });
  await admin.connect();
  try { await admin.query(`CREATE DATABASE "${database}"`); created = true; } finally { await admin.end(); }
  const url = new URL(base); url.pathname = `/${database}`;
  await bootstrap(url.toString());
  process.env.BIBLER_SERVER_DATABASE_URL = url.toString();
  ({ prisma: db } = await import('../src/db/prisma.ts'));
  ({ importBibles } = await import('../src/db/import.ts'));
  client = new Client({ connectionString: url.toString() });
  await client.connect();
  fixture = await mkdtemp(join(tmpdir(), 'bibler-import-regression-'));
  await mkdir(join(fixture, 'docs/main_readme'), { recursive: true });
  await mkdir(join(fixture, 'formats/csv'), { recursive: true });
  await writeFile(join(fixture, 'docs/main_readme/translation_list.md'), '- **KJV (en)**: KJV: King James Version\n');
  await writeFile(join(fixture, 'formats/csv/KJV.csv'), `Book,Chapter,Verse,Text\nGenesis,1,1,${scripture}\n`);
});
after(async () => {
  if (!base) return;
  if (db) await db.$disconnect();
  if (client) await client.end();
  if (fixture) await rm(fixture, { recursive: true, force: true });
  if (created) {
    const admin = new Client({ connectionString: base });
    await admin.connect();
    try { await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`); } finally { await admin.end(); }
  }
});

async function snapshot() {
  const result: Record<string, unknown[]> = {};
  for (const table of ['bibles', 'books', 'verses']) result[table] = (await client.query(`SELECT row_to_json(r) AS row FROM ${table} r ORDER BY id`)).rows;
  return result;
}

test('translation selection validates before writes, and valid reimports preserve rows and source text', { skip: !base }, async () => {
  const csvPath = join(fixture, 'formats/csv/KJV.csv');
  const originalSource = await readFile(csvPath, 'utf8');
  await assert.rejects(importBibles(fixture, new Set(['KJV', 'MISTYPED_TRANSLATION'])), /Unknown translation: MISTYPED_TRANSLATION/);
  assert.deepEqual(await snapshot(), { bibles: [], books: [], verses: [] });
  await importBibles(fixture, new Set(['KJV']));
  assert.equal((await db.verse.findFirstOrThrow()).text, scripture);
  const imported = await snapshot();
  await importBibles(fixture, new Set(['KJV']));
  assert.deepEqual(await snapshot(), imported);
  assert.equal(await readFile(csvPath, 'utf8'), originalSource);
});
