// Author: Preston Lee

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { hash } from 'bcryptjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bootstrap, baselineName } from '../src/db/bootstrap.ts';
import { readCatalog } from '../src/db/catalog.ts';

const base = process.env.BIBLER_SERVER_TEST_DATABASE_URL;
if (process.env.CI && !base) throw new Error('CI requires BIBLER_SERVER_TEST_DATABASE_URL.');
if (base && !new URL(base).pathname.slice(1).startsWith('bibler_test')) throw new Error('Integration database name must start with bibler_test.');
const created: string[] = [];

async function connection(url: string): Promise<Client> {
  const client = new Client({ connectionString: url }); await client.connect(); return client;
}

async function fresh(): Promise<{ url: string; client: Client }> {
  const name = `bibler_test_${randomUUID().replaceAll('-', '')}`;
  const admin = await connection(base!);
  try { await admin.query(`CREATE DATABASE "${name}"`); created.push(name); } finally { await admin.end(); }
  const url = new URL(base!); url.pathname = `/${name}`;
  return { url: url.toString(), client: await connection(url.toString()) };
}

async function baseline(client: Client): Promise<void> {
  await client.query(await readFile(new URL('../prisma/migrations/00000000000000_baseline/migration.sql', import.meta.url), 'utf8'));
  await client.query("INSERT INTO schema_migrations (version) VALUES ('1'),('2'),('3'),('4')");
}

after(async () => {
  if (!base) return;
  const admin = await connection(base);
  try { for (const name of created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
  finally { await admin.end(); }
});

test('fresh and populated adopted databases have identical catalogs and preserve rows', { skip: !base }, async () => {
  const installed = await fresh(), upgraded = await fresh();
  try {
    await baseline(upgraded.client);
    const userId = randomUUID(), roleId = randomUUID();
    await upgraded.client.query(`INSERT INTO users (id, username, name, email, encrypted_password, api_token, created_at, updated_at)
      VALUES ($1,'existing','Existing User','existing@example.test',$2,'existing-token','2026-01-02 03:04:05.123456','2026-01-02 03:04:05.123456')`, [userId, await hash('password', 4)]);
    await upgraded.client.query("INSERT INTO roles (id,name,administrator,created_at,updated_at) VALUES ($1,'Administrator',true,now(),now())", [roleId]);
    await upgraded.client.query('INSERT INTO roles_users (user_id,role_id) VALUES ($1,$2)', [userId,roleId]);
    const before = (await upgraded.client.query('SELECT row_to_json(u) AS row FROM users u ORDER BY id')).rows;
    await bootstrap(installed.url); await bootstrap(upgraded.url);
    assert.deepEqual(await readCatalog(installed.client), await readCatalog(upgraded.client));
    assert.deepEqual((await upgraded.client.query('SELECT row_to_json(u) AS row FROM users u ORDER BY id')).rows, before);
    assert.equal((await upgraded.client.query('SELECT count(*)::int AS count FROM roles_users')).rows[0].count, 1);
    await assert.rejects(upgraded.client.query("INSERT INTO books (bible_id,name,ordinal,testament,created_at,updated_at) VALUES ($1,'Invalid',1,'invalid',now(),now())",[randomUUID()]), /check_books_testament_enum/);
  } finally { await installed.client.end(); await upgraded.client.end(); }
});

test('concurrent adoption and repeated startup record the baseline exactly once', { skip: !base }, async () => {
  const db = await fresh();
  try {
    await baseline(db.client);
    await Promise.all([bootstrap(db.url), bootstrap(db.url)]); await bootstrap(db.url);
    const rows = (await db.client.query('SELECT migration_name, finished_at FROM _prisma_migrations')).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0].migration_name, baselineName); assert.ok(rows[0].finished_at);
  } finally { await db.client.end(); }
});

test('unexpected partial index changes reject adoption before creating migration history', { skip: !base }, async () => {
  const db = await fresh();
  try {
    await baseline(db.client); await db.client.query('DROP INDEX idx_bibles_ai_default_english_true');
    await assert.rejects(bootstrap(db.url), /does not match.*indexes/);
    assert.equal((await db.client.query("SELECT to_regclass('public._prisma_migrations') AS name")).rows[0].name, null);
  } finally { await db.client.end(); }
});

test('unknown schemas and unfinished migrations refuse startup', { skip: !base }, async () => {
  const unknown = await fresh(), failed = await fresh();
  try {
    await unknown.client.query('CREATE TABLE unexpected (id integer PRIMARY KEY)');
    await assert.rejects(bootstrap(unknown.url), /does not match/);
    await bootstrap(failed.url);
    await failed.client.query(`INSERT INTO _prisma_migrations (id,checksum,migration_name,started_at)
      VALUES ($1,'test','99999999999999_failed',now())`, [randomUUID()]);
    await assert.rejects(bootstrap(failed.url), /unfinished migration/);
  } finally { await unknown.client.end(); await failed.client.end(); }
});

test('column collation drift rejects adoption', { skip: !base }, async () => {
  const db = await fresh();
  try {
    await baseline(db.client);
    await db.client.query('ALTER TABLE study_commentaries ALTER COLUMN body TYPE text COLLATE "C"');
    await assert.rejects(bootstrap(db.url), /does not match.*columns/);
  } finally { await db.client.end(); }
});

function seedCommand(url: string, username = 'administrator'): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/db/seed.ts'], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      env: { ...process.env, BIBLER_SERVER_DATABASE_URL: url, BIBLER_SERVER_BOOTSTRAP_ADMIN_USERNAME: username, BIBLER_SERVER_BOOTSTRAP_ADMIN_PASSWORD: 'initial-password' }
    });
    let output = '';
    child.stdout.on('data', chunk => { output += String(chunk); });
    child.stderr.on('data', chunk => { output += String(chunk); });
    child.on('error', reject); child.on('exit', code => resolve({ code, output }));
  });
}

test('administrator bootstrap is repeatable and refuses conflicting roles or empty usernames', { skip: !base }, async () => {
  const normal = await fresh(), conflict = await fresh();
  try {
    await bootstrap(normal.url); await bootstrap(conflict.url);
    assert.equal((await seedCommand(normal.url)).code, 0);
    const before = (await normal.client.query('SELECT row_to_json(u) AS row FROM users u')).rows;
    assert.equal((await seedCommand(normal.url)).code, 0);
    assert.deepEqual((await normal.client.query('SELECT row_to_json(u) AS row FROM users u')).rows, before);
    await conflict.client.query("INSERT INTO roles (name,created_at,updated_at) VALUES ('Administrator',now(),now())");
    const result = await seedCommand(conflict.url);
    assert.equal(result.code, 1); assert.match(result.output, /role.*does not grant administrator access/);
    assert.equal((await conflict.client.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 0);
    const empty = await seedCommand(normal.url, '   ');
    assert.equal(empty.code, 1); assert.match(empty.output, /must not be empty/);
  } finally { await normal.client.end(); await conflict.client.end(); }
});
