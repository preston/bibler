import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { hash } from 'bcryptjs';
import { bootstrap } from '../src/db/bootstrap.ts';

const base = process.env.BIBLER_SERVER_TEST_DATABASE_URL;
if (process.env.CI && !base) throw new Error('CI requires BIBLER_SERVER_TEST_DATABASE_URL.');
if (base && !new URL(base).pathname.slice(1).startsWith('bibler_test')) throw new Error('Integration database name must start with bibler_test.');
type Json = Record<string, unknown>;
let db: typeof import('../src/db/prisma.ts').prisma;
let server: Server;
let origin = '';
const database = `bibler_test_rest_${randomUUID().replaceAll('-', '')}`;
const ids: Record<string, string> = {};
const tokens: Record<string, string> = {};
const now = new Date('2026-01-02T03:04:05.000Z');
// Exact source: bible_databases/formats/csv/KJV.csv, Genesis 1:1–2 (public domain KJV).
const scripture = [
  'In the beginning God created the heaven and the earth.',
  'And the earth was without form and void; and darkness was upon the face of the deep. And the Spirit of God moved upon the face of the waters.',
];

async function admin() { const client = new Client({ connectionString: base }); await client.connect(); return client; }
before(async () => {
  if (!base) return;
  const client = await admin();
  try { await client.query(`CREATE DATABASE "${database}"`); } finally { await client.end(); }
  const url = new URL(base); url.pathname = `/${database}`;
  await bootstrap(url.toString());
  process.env.BIBLER_SERVER_DATABASE_URL = url.toString();
  db = (await import('../src/db/prisma.ts')).prisma;
  const password = await hash('password', 4);
  for (const name of ['owner', 'coleader', 'participant', 'curator', 'administrator', 'access', 'bibles']) {
    const role = await db.role.create({ data: { name, administrator: name === 'administrator', access: name === 'access', bibles: name === 'bibles', curation: name === 'curator', createdAt: now, updatedAt: now } });
    const user = await db.user.create({ data: { username: name, name: name, email: `${name}@example.test`, encryptedPassword: password, apiToken: `existing-${name}-token`, createdAt: now, updatedAt: now } });
    await db.rolesUser.create({ data: { userId: user.id, roleId: role.id } });
    ids[name] = user.id; ids[`${name}Role`] = role.id; tokens[name] = user.apiToken!;
  }
  const bible = await db.bible.create({ data: { name: 'King James Version', abbreviation: 'KJV', language: 'en', license: 'Public domain', aiDefaultEnglish: true, createdAt: now, updatedAt: now } });
  const book = await db.book.create({ data: { name: 'Genesis', ordinal: 1, testament: 'old', bibleId: bible.id, createdAt: now, updatedAt: now } });
  ids.bible = bible.id; ids.book = book.id;
  for (const [index, text] of scripture.entries()) {
    const verse = await db.verse.create({ data: { bibleId: bible.id, bookId: book.id, chapter: 1, ordinal: index + 1, text, createdAt: now, updatedAt: now } });
    ids[`verse${index + 1}`] = verse.id;
  }
  const app = (await import('../src/app.ts')).createApp();
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  if (!base) return;
  if (server) { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); }
  if (db) await db.$disconnect();
  const client = await admin();
  try { await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`); } finally { await client.end(); }
});
async function api(path: string, method = 'GET', payload?: object, principal?: string, expected = 200) {
  const response = await fetch(`${origin}${path}`, { method, headers: { ...(payload ? { 'Content-Type': 'application/json' } : {}), ...(principal ? { Authorization: `Bearer ${tokens[principal] ?? principal}` } : {}) }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : null;
  assert.equal(response.status, expected, `${method} ${path}: ${text}`);
  return json;
}
const object = (value: unknown): Json => { assert.ok(value && typeof value === 'object' && !Array.isArray(value)); return value as Json; };
const item = (value: unknown, envelope: string): Json => object(object(value)[envelope]);
const uuid = (value: Json): string => { assert.equal(typeof value.uuid, 'string'); return value.uuid as string; };
const list = (value: unknown, envelope: string): Json[] => { const rows = object(value)[envelope]; assert.ok(Array.isArray(rows)); return rows as Json[]; };

test('scripture endpoints preserve exact text, identifiers, nested constraints and indexed prefix/OR search', { skip: !base }, async () => {
  await api('/health');
  const bibles = await api('/api/bibles'); assert.ok(Array.isArray(bibles)); assert.equal(bibles[0].uuid, ids.bible);
  const bible = object(await api(`/api/bibles/${ids.bible}?include=books`)); assert.equal((bible.books as Json[])[0]?.uuid, ids.book);
  const books = await api(`/api/bibles/${ids.bible}/books`); assert.ok(Array.isArray(books)); assert.equal(books[0].testament, 'old');
  assert.equal(object(await api(`/api/books/${ids.book}`)).uuid, ids.book);
  assert.equal(object(await api(`/api/bibles/${ids.bible}/books/${ids.book}`)).uuid, ids.book);
  const chapters = await api(`/api/bibles/${ids.bible}/books/${ids.book}/chapters`); assert.deepEqual(chapters, [1]);
  const verses = await api(`/api/bibles/${ids.bible}/books/${ids.book}/chapters/1/verses`); assert.ok(Array.isArray(verses)); assert.deepEqual(verses.map((v) => v.text), scripture);
  const verse = object(await api(`/api/bibles/${ids.bible}/books/${ids.book}/chapters/1/verses/1`)); assert.equal(verse.text, scripture[0]); assert.equal(verse.uuid, ids.verse1);
  const found = await api(`/api/bibles/${ids.bible}/search`, 'POST', { text: 'begin heaven missingword' }); assert.ok(Array.isArray(found)); assert.equal(found.length, 1); assert.equal(found[0].text, scripture[0]); assert.equal(found[0].book.uuid, ids.book);
  assert.deepEqual(await api(`/api/bibles/${ids.bible}/search`, 'POST', { text: '' }), []);
  await api(`/api/bibles/${ids.bible}/books/${randomUUID()}/chapters`, 'GET', undefined, undefined, 404);
  await api(`/${ids.bible}/${ids.book}/1`, 'GET', undefined, undefined, 404);
});

test('existing bcrypt hashes and opaque tokens work, while login/logout rotate tokens', { skip: !base }, async () => {
  await api('/api/session', 'GET', undefined, undefined, 401);
  await api('/api/session', 'POST', { username: 'owner', password: 'wrong' }, undefined, 401);
  const before = await db.user.findUniqueOrThrow({ where: { id: ids.owner } });
  const existing = object(await api('/api/session', 'GET', undefined, 'owner')); assert.equal(existing.token, tokens.owner);
  const logged = object(await api('/api/session', 'POST', { username: ' OWNER ', password: 'password' }, undefined, 201));
  assert.notEqual(logged.token, tokens.owner);
  await api('/api/session', 'GET', undefined, 'owner', 401);
  tokens.owner = logged.token as string;
  await api('/api/session', 'DELETE', undefined, 'owner', 204);
  await api('/api/session', 'GET', undefined, 'owner', 401);
  const again = object(await api('/api/session', 'POST', { username: 'owner', password: 'password' }, undefined, 201)); tokens.owner = again.token as string;
  const after = await db.user.findUniqueOrThrow({ where: { id: ids.owner } }); assert.equal(after.encryptedPassword, before.encryptedPassword); assert.equal(after.createdAt.toISOString(), before.createdAt.toISOString());
});

test('system role/user administration enforces grants, UUID role assignments, defaults and password validation', { skip: !base }, async () => {
  for (const principal of [undefined, 'owner', 'curator', 'bibles']) await api('/api/system/roles', 'GET', undefined, principal, 403);
  const roles = list(await api('/api/system/roles', 'GET', undefined, 'access'), 'roles'); assert.equal(roles.length, 7);
  const role = item(await api('/api/system/roles', 'POST', { role: { name: 'Default Bible Access', isDefault: true, bibles: true } }, 'access', 201), 'role');
  const roleId = role.id as string;
  await api(`/api/system/roles/${roleId}`, 'GET', undefined, 'administrator');
  const user = item(await api('/api/system/users', 'POST', { user: { username: 'CreatedUser', email: 'Created@Example.Test', name: 'Created User', password: 'password', passwordConfirmation: 'password' }, roleIds: [ids.accessRole] }, 'access', 201), 'user');
  ids.createdUser = user.id as string; assert.equal((user.roles as Json[]).length, 2); assert.equal(user.email, 'created@example.test');
  const logged = object(await api('/api/session', 'POST', { username: 'createduser', password: 'password' }, undefined, 201)); assert.equal(object(logged.permissions).bibles, true); assert.equal(object(logged.permissions).access, true);
  await api('/api/system/users', 'POST', { user: { username: 'CREATEDUSER', email: 'other@example.test', name: 'Duplicate', password: 'password' } }, 'access', 422);
  await api('/api/system/users', 'POST', { user: { username: 'invalid', email: 'invalid', name: '', password: 'short' } }, 'access', 422);
  const updated = item(await api(`/api/system/users/${user.id}`, 'PATCH', { user: { name: 'Changed', password: '' }, roleIds: [ids.curatorRole] }, 'access'), 'user'); assert.equal(updated.name, 'Changed'); assert.equal((updated.roles as Json[]).length, 1);
  const paged = object(await api('/api/system/users?q=Created&perPage=1&sort=createdAt&direction=asc', 'GET', undefined, 'access')); assert.equal(list(paged, 'users').length, 1); assert.equal(object(paged.meta).totalCount, 1); assert.equal(object(paged.meta).perPage, 1);
  await api(`/api/system/users/${user.id}`, 'GET', undefined, 'administrator');
  await api(`/api/system/roles/${roleId}`, 'PATCH', { role: { name: 'Renamed default', isDefault: false } }, 'access');
  await api(`/api/system/roles/${roleId}`, 'DELETE', undefined, 'access', 204);
  assert.equal(await db.rolesUser.count({ where: { roleId } }), 0);
});

test('AI defaults require Bible grants and update atomically without touching imported text', { skip: !base }, async () => {
  for (const principal of [undefined, 'owner', 'access', 'curator']) await api('/api/system/settings/ai-defaults', 'GET', undefined, principal, 403);
  const result = object(await api('/api/system/settings/ai-defaults?q=KJV&perPage=1', 'GET', undefined, 'bibles')); assert.equal(list(result, 'bibles')[0]?.uuid, ids.bible); assert.equal(object(result.meta).totalCount, 1);
  const second = await db.bible.create({ data: { abbreviation: 'OTHER', name: 'Other Bible', language: 'en', createdAt: now, updatedAt: now } });
  await api('/api/system/settings/ai-defaults', 'PATCH', { defaults: [{ uuid: second.id, aiDefaultEnglish: true }, { uuid: ids.bible, aiDefaultGreek: true }] }, 'bibles');
  assert.equal((await db.bible.findUniqueOrThrow({ where: { id: ids.bible } })).aiDefaultEnglish, false);
  await api('/api/system/settings/ai-defaults', 'PATCH', { defaults: [{ uuid: second.id, aiDefaultEnglish: true }, { uuid: ids.bible, aiDefaultEnglish: true }] }, 'administrator', 422);
  assert.equal((await db.bible.findUniqueOrThrow({ where: { id: second.id } })).aiDefaultEnglish, true);
  await api('/api/system/settings/ai-defaults', 'PATCH', { defaults: [{ uuid: ids.bible, aiDefaultEnglish: true }] }, 'administrator');
  assert.equal((await db.verse.findUniqueOrThrow({ where: { id: ids.verse1 } })).text, scripture[0]);
});

test('study visibility, collaboration roles, assignments, ownership and delete permissions match the existing policies', { skip: !base }, async () => {
  await api('/api/studies', 'POST', { study: { title: 'Guest' } }, undefined, 401);
  await api('/api/studies', 'POST', { study: { title: ' ' } }, 'owner', 422);
  const study = item(await api('/api/studies', 'POST', { study: { title: 'Private study', goal: 'A study goal' } }, 'owner', 201), 'study'); ids.study = uuid(study);
  assert.equal(study.visibility, 'private'); assert.equal(object(study.capabilities).mode, 'leader');
  const path = `/api/studies/${ids.study}`;
  for (const principal of [undefined, 'participant', 'access', 'bibles']) await api(path, 'GET', undefined, principal, 403);
  for (const principal of ['curator', 'administrator']) await api(path, 'GET', undefined, principal);
  await api(`${path}/assignments`, 'POST', { username: 'coleader' }, 'owner', 201);
  await api(`${path}/assignments`, 'POST', { email: 'COLEADER@EXAMPLE.TEST' }, 'owner', 422);
  await api(`${path}/assignments`, 'POST', { username: 'owner' }, 'owner', 422);
  await api(`${path}/assignments`, 'POST', { username: 'unknown' }, 'owner', 422);
  const co = item(await api(path, 'GET', undefined, 'coleader'), 'study'); assert.equal(co.myStudyRole, 'co_leader'); assert.equal(object(co.capabilities).canDeleteStudy, false);
  await api(`${path}/assignments`, 'GET', undefined, 'participant', 403);
  assert.equal(list(await api(`${path}/assignments`, 'GET', undefined, 'coleader'), 'assignments').length, 1);
  await api(path, 'DELETE', undefined, 'coleader', 403);
  await api(`${path}/transfer-owner`, 'POST', { userId: ids.coleader }, 'coleader', 403);
  await api(path, 'PATCH', { study: { visibility: 'sharable' } }, 'coleader');
  const guest = item(await api(path), 'study'); assert.equal(guest.myStudyRole, 'participant'); assert.equal(object(guest.capabilities).canEditStructure, false);
  await api(path, 'PATCH', { study: { title: 'Guest edit' } }, undefined, 403);
  assert.equal(list(await api('/api/studies'), 'studies').length, 0);
  await api(path, 'PATCH', { study: { title: 'Public study', visibility: 'public' } }, 'owner');
  const page = object(await api('/api/studies?q=public&perPage=1&sort=title&direction=asc')); assert.equal(object(page.meta).totalCount, 1); assert.equal(list(page, 'studies').length, 1);
  assert.equal(list(await api('/api/studies?scope=owned', 'GET', undefined, 'coleader'), 'studies').length, 1);
  await api('/api/studies?scope=owned', 'GET', undefined, undefined, 401);
  await api(`${path}/role`, 'GET', undefined, 'coleader');
  await api(`${path}/role`, 'PATCH', { mode: 'leader' }, 'participant', 403);
  await api(`${path}/transfer-owner`, 'POST', { userId: ids.participant }, 'owner', 422);
  const transferred = item(await api(`${path}/transfer-owner`, 'POST', { userId: ids.coleader }, 'owner'), 'study'); assert.equal(object(transferred.owner).id, ids.coleader);
  const assignments = list(await api(`${path}/assignments`, 'GET', undefined, 'coleader'), 'assignments'); assert.equal(assignments[0]?.userId, ids.owner);
  await api(`${path}/transfer-owner`, 'POST', { userId: ids.owner }, 'coleader');
  await api(`${path}/assignments/${ids.coleader}`, 'DELETE', undefined, 'owner', 204);
  await api(`${path}/assignments`, 'POST', { username: 'coleader' }, 'owner', 201);
});

test('all study nested resources validate, reorder and apply dependent deletion callbacks', { skip: !base }, async () => {
  const path = `/api/studies/${ids.study}`;
  const verse = item(await api(`${path}/verses`, 'POST', { studyVerse: { verseUuid: ids.verse1, bibleUuid: 'ignored', chapter: 99, ordinal: 99, verseText: 'ignored', note: 'Read carefully' } }, 'coleader', 201), 'verse');
  ids.studyVerse = uuid(verse); assert.equal(verse.bibleUuid, ids.bible); assert.equal(verse.verseText, scripture[0]); assert.equal(verse.chapter, 1);
  await api(`${path}/verses`, 'POST', { studyVerse: { verseUuid: randomUUID() } }, 'owner', 422);
  await api(`${path}/verses`, 'POST', { studyVerse: { bibleUuid: ids.bible, bookUuid: ids.book, chapter: 0, ordinal: 1 } }, 'owner', 422);
  await api(`${path}/verses/${ids.studyVerse}`, 'PATCH', { studyVerse: { note: 'Updated' } }, 'participant', 403);
  await api(`${path}/verses/${ids.studyVerse}`, 'PATCH', { studyVerse: { note: 'Updated' } }, 'coleader');
  assert.equal(list(await api(`${path}/verses`), 'verses')[0]?.verseText, scripture[0]);
  const commentary = item(await api(`${path}/commentaries`, 'POST', { studyCommentary: { title: 'Commentary', body: 'Read the cited text', context: { verseUuid: ids.verse1 } } }, 'owner', 201), 'commentary'); ids.commentary = uuid(commentary);
  await api(`${path}/commentaries/${ids.commentary}`); await api(`${path}/commentaries/${ids.commentary}`, 'PATCH', { studyCommentary: { sourceType: 'ai' } }, 'curator');
  await api(`${path}/commentaries`, 'POST', { studyCommentary: { title: 'Invalid', sourceType: 'unknown' } }, 'owner', 422);
  const question = item(await api(`${path}/questions`, 'POST', { studyQuestion: { prompt: 'What does the passage say?', verseAnchor: { verseUuid: ids.verse1 } } }, 'owner', 201), 'question'); ids.question = uuid(question);
  const second = item(await api(`${path}/questions`, 'POST', { studyQuestion: { prompt: 'How should we apply it?', questionType: 'application' } }, 'owner', 201), 'question'); ids.secondQuestion = uuid(second);
  const reordered = list(await api(`${path}/questions/reorder`, 'POST', { orderedUuids: [ids.secondQuestion, ids.question] }, 'coleader'), 'questions'); assert.equal(reordered[0]?.uuid, ids.secondQuestion);
  await api(`${path}/questions/${ids.question}`); await api(`${path}/questions/${ids.question}`, 'PATCH', { studyQuestion: { questionType: 'observation' } }, 'owner');
  await api(`${path}/questions`, 'POST', { studyQuestion: { prompt: 'invalid', questionType: 'invalid' } }, 'owner', 422);
  const task = item(await api(`${path}/tasks`, 'POST', { studyTask: { instruction: 'Read Genesis 1', taskType: 'reading', dueAt: '2026-10-20T12:00:00.000Z' } }, 'owner', 201), 'task'); ids.task = uuid(task);
  await api(`${path}/tasks/${ids.task}`); await api(`${path}/tasks/${ids.task}`, 'PATCH', { studyTask: { status: 'in_progress' } }, 'coleader');
  await api(`${path}/tasks/reorder`, 'POST', { orderedUuids: [ids.task] }, 'owner');
  await api(`${path}/tasks`, 'POST', { studyTask: { instruction: 'invalid', status: 'invalid' } }, 'owner', 422);
  await api(`${path}/tasks`, 'POST', { studyTask: { instruction: 'invalid', dueAt: 'not-a-date' } }, 'owner', 422);
  const plan = item(await api(`${path}/plan-items`, 'POST', { studyPlanItem: { title: 'Read passage', itemType: 'verse', resourceType: 'study_verse', resourceUuid: ids.studyVerse } }, 'owner', 201), 'planItem'); ids.plan = uuid(plan); assert.equal(plan.duration, 2); assert.equal(plan.myStatus, 'todo');
  await api(`${path}/plan-items`, 'POST', { studyPlanItem: { title: 'invalid', itemType: 'custom', resourceType: 'study_verse', resourceUuid: ids.studyVerse } }, 'owner', 422);
  await api(`${path}/plan-items/reorder`, 'POST', { orderedUuids: [] }, 'owner', 422);
  await api(`${path}/plan-items/reorder`, 'POST', { orderedUuids: [ids.plan] }, 'owner');
  const noDuration = item(await api(`${path}/plan-items/${ids.plan}`, 'PATCH', { studyPlanItem: { duration: 0 } }, 'owner'), 'planItem'); assert.equal(noDuration.duration, null);
  await api(`${path}/plan-items/${ids.plan}/state`, 'PATCH', { status: 'complete' }, undefined, 401);
  await api(`${path}/plan-items/${ids.plan}/state`, 'PATCH', { status: 'invalid' }, 'participant', 422);
  const state = item(await api(`${path}/plan-items/${ids.plan}/state`, 'PATCH', { status: 'complete' }, 'participant'), 'planItem'); assert.equal(state.myStatus, 'complete');
  assert.equal(list(await api(`${path}/plan-items`, 'GET', undefined, 'owner'), 'planItems')[0]?.myStatus, 'todo');
  assert.equal(list(await api(`${path}/plan-items`, 'GET', undefined, 'participant'), 'planItems')[0]?.myStatus, 'complete');
  const answers = `${path}/questions/${ids.question}/answers`;
  await api(answers, 'POST', { studyAnswer: { response: 'answer' } }, undefined, 401);
  const answer = item(await api(answers, 'POST', { studyAnswer: { response: 'The passage describes creation.', visibility: 'study', studyCommentaryId: ids.commentary } }, 'participant', 201), 'answer'); ids.answer = uuid(answer); assert.equal(answer.authorLabel, 'participant'); assert.equal(answer.studyCommentaryUuid, ids.commentary);
  await api(`${answers}/${ids.answer}`, 'PATCH', { studyAnswer: { response: 'Updated response' } }, 'participant');
  await api(`${answers}/${ids.answer}`, 'PATCH', { studyAnswer: { response: 'Not my answer' } }, 'bibles', 403);
  assert.equal(list(await api(answers), 'answers').length, 1);
  await api(`${path}/commentaries/${ids.commentary}`, 'DELETE', undefined, 'owner', 204);
  assert.equal((await db.studyAnswer.findUniqueOrThrow({ where: { id: ids.answer } })).studyCommentaryId, null);
  await api(`${path}/questions/${ids.question}`, 'DELETE', undefined, 'coleader', 204);
  assert.equal(await db.studyAnswer.count({ where: { id: ids.answer } }), 0);
  await api(`${path}/plan-items/${ids.plan}`, 'DELETE', undefined, 'owner', 204);
  assert.equal(await db.studyPlanItemUserState.count({ where: { studyPlanItemId: ids.plan } }), 0);
  await api(`${path}/verses/${ids.studyVerse}`, 'DELETE', undefined, 'owner', 204);
  await api(`${path}/tasks/${ids.task}`, 'DELETE', undefined, 'coleader', 204);
  await api(path, 'DELETE', undefined, 'curator', 204);
  assert.equal(await db.studyQuestion.count({ where: { studyId: ids.study } }), 0); assert.equal(await db.studyAssignment.count({ where: { studyId: ids.study } }), 0);
});

test('nested resources cannot be reached through a different study and answer ownership remains independent of study editing', { skip: !base }, async () => {
  const first = item(await api('/api/studies', 'POST', { study: { title: 'First', visibility: 'public' } }, 'owner', 201), 'study');
  const second = item(await api('/api/studies', 'POST', { study: { title: 'Second', visibility: 'private' } }, 'owner', 201), 'study');
  const question = item(await api(`/api/studies/${uuid(first)}/questions`, 'POST', { studyQuestion: { prompt: 'Question' } }, 'owner', 201), 'question');
  await api(`/api/studies/${uuid(second)}/questions/${uuid(question)}`, 'GET', undefined, 'owner', 404);
  const answers = `/api/studies/${uuid(first)}/questions/${uuid(question)}/answers`;
  const answer = item(await api(answers, 'POST', { studyAnswer: { response: 'Answer', visibility: 'private' } }, 'participant', 201), 'answer');
  await api(`${answers}/${uuid(answer)}`, 'DELETE', undefined, 'bibles', 403);
  await api(`${answers}/${uuid(answer)}`, 'DELETE', undefined, 'participant', 204);
  await api(`/api/studies/${uuid(first)}`, 'DELETE', undefined, 'administrator', 204);
  await api(`/api/studies/${uuid(second)}`, 'DELETE', undefined, 'owner', 204);
});

test('sermons, sections and section verses preserve scripture callbacks, boundaries and cascades', { skip: !base }, async () => {
  await api('/api/sermons', 'POST', { sermon: { title: 'Guest' } }, undefined, 401);
  const sermon = item(await api('/api/sermons', 'POST', { sermon: { title: 'Creation sermon', targetDurationMinutes: 20 } }, 'owner', 201), 'sermon'); const path = `/api/sermons/${uuid(sermon)}`;
  for (const principal of [undefined, 'participant', 'access', 'bibles', 'coleader']) await api(path, 'GET', undefined, principal, 403);
  for (const principal of ['curator', 'administrator']) await api(path, 'GET', undefined, principal);
  await api(path, 'PATCH', { sermon: { visibility: 'public' } }, 'owner');
  await api(path); const listed = object(await api('/api/sermons?q=creation&perPage=1')); assert.equal(object(listed.meta).totalCount, 1);
  assert.equal(list(await api('/api/sermons?scope=owned', 'GET', undefined, 'owner'), 'sermons').length, 1);
  await api(path, 'PATCH', { sermon: { title: 'Unauthorized' } }, 'participant', 403);
  const section = item(await api(`${path}/sections`, 'POST', { sermonSection: { title: 'Opening', body: 'Read the passage.', estimatedMinutes: 5 } }, 'owner', 201), 'sermonSection');
  const sectionPath = `${path}/sections/${uuid(section)}`;
  await api(sectionPath, 'PATCH', { sermonSection: { position: -1 } }, 'owner', 422);
  await api(sectionPath, 'PATCH', { sermonSection: { title: 'Introduction' } }, 'curator');
  const verse = item(await api(`${sectionPath}/verses`, 'POST', { sermonSectionVerse: { verseUuid: ids.verse1, verseText: 'ignored' } }, 'owner', 201), 'sermonSectionVerse'); assert.equal(verse.verseText, scripture[0]); assert.equal(verse.bibleUuid, ids.bible);
  await api(`${sectionPath}/verses/${uuid(verse)}`, 'PATCH', { sermonSectionVerse: { verseUuid: ids.verse2 } }, 'owner');
  const sections = list(await api(`${path}/sections`), 'sermonSections'); assert.equal((sections[0]?.sermonSectionVerses as Json[])[0]?.verseText, scripture[1]);
  const verseList = list(await api(`${sectionPath}/verses`), 'sermonSectionVerses'); assert.equal(verseList.length, 1);
  await api(`${sectionPath}/verses/${uuid(verse)}`, 'DELETE', undefined, 'participant', 403);
  await api(`${sectionPath}/verses/${uuid(verse)}`, 'DELETE', undefined, 'owner', 204);
  const remaining = item(await api(`${sectionPath}/verses`, 'POST', { sermonSectionVerse: { verseUuid: ids.verse1 } }, 'owner', 201), 'sermonSectionVerse');
  await api(sectionPath, 'DELETE', undefined, 'owner', 204); assert.equal(await db.sermonSectionVerse.count({ where: { id: uuid(remaining) } }), 0);
  const cascadeSection = item(await api(`${path}/sections`, 'POST', { sermonSection: {} }, 'owner', 201), 'sermonSection');
  await api(`${path}/sections/${uuid(cascadeSection)}/verses`, 'POST', { sermonSectionVerse: { verseUuid: ids.verse1 } }, 'owner', 201);
  await api(path, 'DELETE', undefined, 'curator', 204); assert.equal(await db.sermonSection.count({ where: { sermonId: uuid(sermon) } }), 0); assert.equal(await db.sermonSectionVerse.count({ where: { sermonSectionId: uuid(cascadeSection) } }), 0);
});

test('document text is stored exactly, previews are bounded, and access stays owner-scoped', { skip: !base }, async () => {
  await api('/api/documents', 'GET', undefined, undefined, 401);
  const extractedText = `${scripture[0]}\n${'Document notes. '.repeat(50)}`;
  const document = item(await api('/api/documents', 'POST', { document: { originalFilename: 'notes.pdf', extractedText } }, 'owner', 201), 'document'); const path = `/api/documents/${uuid(document)}`;
  assert.equal(document.extractedText, extractedText);
  const documents = list(await api('/api/documents?q=notes', 'GET', undefined, 'owner'), 'documents'); assert.equal(documents.length, 1); assert.equal((documents[0]?.extractedTextPreview as string).length, 500);
  assert.deepEqual(list(await api('/api/documents', 'GET', undefined, 'participant'), 'documents'), []);
  for (const principal of ['participant', 'curator']) await api(path, 'PATCH', { document: { extractedText: 'Cannot edit' } }, principal, 403);
  await api(path, 'PATCH', { document: { extractedText: '' } }, 'owner', 422);
  await api(path, 'PATCH', { document: { originalFilename: 'renamed.pdf' } }, 'owner');
  await api(path, 'DELETE', undefined, 'participant', 403);
  await api(path, 'DELETE', undefined, 'administrator', 204);
});


test('pagination defaults nonpositive page sizes to 25 for every paged collection', { skip: !base }, async () => {
  for (const path of ['/api/studies', '/api/sermons', '/api/system/users', '/api/system/settings/ai-defaults']) {
    for (const [requested, expected] of [[-5, 25], [0, 25], [1, 1], [101, 100]]) {
      const result = object(await api(`${path}?perPage=${requested}`, 'GET', undefined, 'administrator'));
      assert.equal(object(result.meta).perPage, expected, path);
    }
  }
});

test('cleared resource positions append on create and preserve each update callback', { skip: !base }, async () => {
  const study = item(await api('/api/studies', 'POST', { study: { title: 'Position callbacks' } }, 'owner', 201), 'study');
  const path = `/api/studies/${uuid(study)}`;
  await api(`${path}/questions`, 'POST', { studyQuestion: { prompt: 'First question', position: 3 } }, 'owner', 201);
  const question = item(await api(`${path}/questions`, 'POST', { studyQuestion: { prompt: 'Appended question', position: null } }, 'owner', 201), 'question');
  assert.equal(question.position, 4);
  await api(`${path}/questions/${uuid(question)}`, 'PATCH', { studyQuestion: { position: null } }, 'owner', 422);
  assert.equal(item(await api(`${path}/questions/${uuid(question)}`, 'GET', undefined, 'owner'), 'question').position, 4);
  await api(`${path}/plan-items`, 'POST', { studyPlanItem: { title: 'First step', itemType: 'custom', position: 7 } }, 'owner', 201);
  const plan = item(await api(`${path}/plan-items`, 'POST', { studyPlanItem: { title: 'Appended step', itemType: 'custom', position: null } }, 'owner', 201), 'planItem');
  assert.equal(plan.position, 8);
  const reset = item(await api(`${path}/plan-items/${uuid(plan)}`, 'PATCH', { studyPlanItem: { position: null } }, 'owner'), 'planItem');
  assert.equal(reset.position, 0);
  await api(path, 'DELETE', undefined, 'owner', 204);
});
