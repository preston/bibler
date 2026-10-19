import { randomUUID } from 'node:crypto';
import type { Bible, Study } from '@prisma/client';
import { prisma } from '../db/prisma.ts';
import { type Chat, type ChatResult, type JsonObject, OllamaClient, object, parseResponseJson } from './client.ts';
import { policy, searchPrompt, suggestionsPrompt } from './prompts.ts';
import { searchTerms } from '../services/search.ts';
export type EventWriter = (event: string, data: unknown) => void;
export type Search = { bible_uuid: string; text: string; limit: number };
export type ScriptureRow = { bible_uuid: string; book_uuid: string; book_name: string; chapter: number; ordinal: number; verse_uuid: string; text: string };
export type SearchResult = { verses: ScriptureRow[]; errors: string[] };
const english = (language: string) => /^en(?:$|[-_])/i.test(language);
export const nonEnglishIntent = /\b(hebrew|hbo|aramaic|syriac|greek|septuagint|lxx|masoretic|interlinear|vulgate|latin|original\s+language|dead\s+sea|byzantine|critical\s+edition|transliteration|strong(?:'s|s)?)\b/i;
const metadata = (bible: Bible) => ({ uuid: bible.id, name: bible.name, abbreviation: bible.abbreviation, language: bible.language, license: bible.license });
export async function referenceBibles(message: string, db = prisma, allLanguages = false) {
  const bibles = await db.bible.findMany({ orderBy: { id: 'asc' } });
  const select = (flag: keyof Bible, languages: string[]) => bibles.find(b => b[flag] === true) ?? bibles.find(b => languages.includes(b.language));
  const refs = [select('aiDefaultEnglish', ['en']), select('aiDefaultHebrewOt', ['hbo', 'he']), select('aiDefaultGreek', ['grc', 'el']), select('aiDefaultAramaic', ['arc', 'syr'])].filter((b): b is Bible => Boolean(b));
  const unique = [...new Map(refs.map(b => [b.id, b])).values()];
  return (allLanguages || nonEnglishIntent.test(message) ? unique : [unique.find(b => english(b.language)) ?? unique[0]].filter((b): b is Bible => Boolean(b))).map(metadata);
}
export function normalizeSearches(input: unknown, references: Array<{ uuid: string }>): Search[] {
  const allowed = new Set(references.map(ref => ref.uuid));
  if (!Array.isArray(input) || !references.length) return [];
  return input.slice(0, 20).flatMap(item => {
    const row = object(item), text = String(row.text ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    const uuid = String(row.bible_uuid ?? row.bibleUuid ?? references[0]!.uuid);
    if (!text || !allowed.has(uuid)) return [];
    return [{ text, bible_uuid: uuid, limit: Math.min(25, Math.max(1, Math.trunc(Number(row.limit)) || 25)) }];
  });
}
const stopWords = new Set('that this with from have been were they will your what when shall unto thee thou which about their there minute minutes hour hours lesson study plan youth sermon elementary school children group discussion break create covering adding named whole thing things need needs want wants would could should please help such certain many much more very also only into than then them these those some same well just like'.split(' '));
export function fallbackSearches(message: string, bibleUuid?: string): Search[] {
  if (!bibleUuid) return [];
  let words = [...new Set((message.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []).filter(w => !stopWords.has(w) && w.length <= 22))];
  if (words.length < 6) words = [...new Set([...words, 'god', 'lord', 'jesus', 'christ', 'faith', 'love'])];
  return words.slice(0, 20).map((text, i) => ({ text, bible_uuid: bibleUuid, limit: i < 4 ? 10 : 18 }));
}
export async function searchScripture(searches: Search[], db = prisma, signal?: AbortSignal): Promise<SearchResult> {
  const result: SearchResult = { verses: [], errors: [] }, seen = new Set<string>();
  for (const search of searches) {
    signal?.throwIfAborted();
    if (result.verses.length >= 32) break;
    const bible = await db.bible.findFirst({ where: { id: search.bible_uuid } });
    if (!bible) { result.errors.push(`Unknown bible: ${search.bible_uuid}`); continue; }
    const query = searchTerms(search.text);
    if (!query) { result.errors.push('Search text is blank.'); continue; }
    const limit = Math.min(search.limit, 32 - result.verses.length);
    const rows = await db.$queryRaw<Array<{ id: string; book_id: string; name: string; chapter: number; ordinal: number; text: string }>>`
      SELECT v.id, v.book_id, b.name, v.chapter, v.ordinal, v.text FROM verses v JOIN books b ON b.id = v.book_id
      WHERE v.bible_id = ${bible.id}::uuid AND to_tsvector('simple', coalesce(v.text, '')) @@ to_tsquery('simple', ${query})
      ORDER BY ts_rank(to_tsvector('simple', coalesce(v.text, '')), to_tsquery('simple', ${query})) DESC, v.id LIMIT ${limit}`;
    for (const v of rows) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      result.verses.push({ bible_uuid: bible.id, book_uuid: v.book_id, book_name: v.name, chapter: v.chapter, ordinal: v.ordinal, verse_uuid: v.id, text: v.text.length > 1024 ? `${v.text.slice(0, 1024)}... [truncated]` : v.text });
    }
  }
  return result;
}
export async function studyVerseRows(studyId: string, limit?: number, db = prisma) {
  const rows = await db.studyVerse.findMany({ where: { studyId }, orderBy: [{ position: 'asc' }, { id: 'asc' }], ...(limit === undefined ? {} : { take: limit }) });
  const ids = rows.flatMap(row => row.verseUuid ? [row.verseUuid] : []).filter(id => /^[0-9a-f-]{36}$/i.test(id));
  const verses = ids.length ? await db.verse.findMany({ where: { id: { in: ids } } }) : [];
  const texts = new Map(verses.map(v => [v.id, v.text]));
  return rows.map(row => ({ uuid: row.id, verse_uuid: row.verseUuid, bible_uuid: row.bibleUuid, book_uuid: row.bookUuid, chapter: row.chapter, ordinal: row.ordinal, note: row.note, verse_text: texts.get(row.verseUuid ?? '') || row.verseText }));
}
export async function studySnapshot(study: Study, db = prisma) {
  const [verses, commentaries, questions, tasks, items] = await Promise.all([
    studyVerseRows(study.id, undefined, db),
    db.studyCommentary.findMany({ where: { studyId: study.id }, orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    db.studyQuestion.findMany({ where: { studyId: study.id }, orderBy: [{ position: 'asc' }, { id: 'asc' }], include: { studyAnswers: { orderBy: { createdAt: 'desc' }, take: 8 } } }),
    db.studyTask.findMany({ where: { studyId: study.id }, orderBy: [{ position: 'asc' }, { id: 'asc' }] }),
    db.studyPlanItem.findMany({ where: { studyId: study.id, duration: { gt: 0 } }, select: { duration: true } })
  ]);
  return { study: { uuid: study.id, title: study.title, goal: study.goal, visibility: study.visibility, plan_total_duration_minutes: items.reduce((sum, row) => sum + (row.duration ?? 0), 0) }, verses,
    commentaries: commentaries.map(c => ({ uuid: c.id, source_type: c.sourceType, title: c.title, body: c.body })),
    questions: questions.map(q => ({ uuid: q.id, prompt: q.prompt, question_type: q.questionType, guidance_notes: q.guidanceNotes, verse_anchor: q.verseAnchor, answers: q.studyAnswers.map(a => ({ response: a.response, author_label: a.authorLabel, visibility: a.visibility })) })),
    tasks: tasks.map(t => ({ uuid: t.id, instruction: t.instruction, task_type: t.taskType, status: t.status, assignee_label: t.assigneeLabel })) };
}
export function suggestionList(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  const row = object(parsed);
  if (Array.isArray(row.suggestions)) return row.suggestions;
  const nested = object(row.output);
  return Array.isArray(nested.suggestions) ? nested.suggestions : row.type ? [row] : [];
}
const token = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[-\s]+/g, '_');
const duration = (value: unknown) => value !== null && value !== undefined && /^\d+$/.test(String(value)) ? Number(value) : null;
export async function normalizeSuggestions(input: unknown[], db = prisma): Promise<JsonObject[]> {
  const rows: JsonObject[] = [];
  for (const item of input) {
    if (rows.length >= 16) break;
    const row = object(item), type = token(row.type), payload = object(row.payload);
    if (!['add_verse', 'add_commentary', 'add_question', 'add_task', 'add_worship'].includes(type)) continue;
    if (type === 'add_task') {
      payload.task_type = token(payload.task_type ?? payload.taskType);
      if (!['discussion', 'reading', 'prayer', 'memorization', 'reflection', 'create'].includes(String(payload.task_type))) continue;
      if (payload.status) {
        payload.status = token(payload.status);
        if (!['open', 'in_progress', 'completed', 'archived'].includes(String(payload.status))) continue;
      }
    }
    if (type === 'add_verse') {
      const verseUuid = String(payload.verse_uuid ?? payload.verseUuid ?? '');
      let verse = /^[0-9a-f-]{36}$/i.test(verseUuid) ? await db.verse.findFirst({ where: { id: verseUuid } }) : null;
      if (!verse && payload.bible_uuid && payload.book_uuid && /^[0-9a-f-]{36}$/i.test(String(payload.bible_uuid)) && /^[0-9a-f-]{36}$/i.test(String(payload.book_uuid))) verse = await db.verse.findFirst({ where: { bibleId: String(payload.bible_uuid), bookId: String(payload.book_uuid), chapter: Number(payload.chapter) || 0, ordinal: Number(payload.ordinal) || 0 } });
      // The LLM may propose nonexistent UUIDs; never return invented coordinates to the UI.
      if (!verse) continue;
      Object.assign(payload, { verse_uuid: verse.id, bible_uuid: verse.bibleId, book_uuid: verse.bookId, chapter: verse.chapter, ordinal: verse.ordinal });
    }
    rows.push({ order: rows.length, id: row.id || randomUUID(), type, title: String(row.title ?? '').slice(0, 200), summary: String(row.summary ?? '').slice(0, 2000), payload, duration: duration(row.duration ?? payload.duration) });
  }
  return rows;
}
/** Largest remainder allocation keeps integer totals exact, including zero-weight suggestions. */
export function scaleDurations(rows: JsonObject[], target: number, field = 'duration'): void {
  if (!rows.length || target <= 0) return;
  const weights = rows.map(row => Math.max(0, Math.round(Number(row[field])) || 0));
  const total = weights.reduce((sum, n) => sum + n, 0);
  const exact = weights.map(n => total ? n * target / total : target / rows.length);
  const floors = exact.map(Math.floor);
  const remainder = target - floors.reduce((sum, n) => sum + n, 0);
  const ranks = exact.map((n, i) => ({ i, fraction: n - floors[i]! })).sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remainder; i++) floors[ranks[i % ranks.length]!.i]!++;
  rows.forEach((row, i) => { row[field] = floors[i]; });
}
export async function planSearch(message: string, snapshot: unknown, chat: Chat, db = prisma, signal?: AbortSignal, stream = false, emit: EventWriter = () => {}, allLanguages = false): Promise<{ searches: Search[]; result: SearchResult; references: Awaited<ReturnType<typeof referenceBibles>>; error?: string; hint?: string }> {
  const references = await referenceBibles(message, db, allLanguages);
  emit('status', { phase: 'planning', message: 'Planning database searches…' });
  const response = await chat.run({ system: policy.search, user: searchPrompt(message, snapshot, references), format: 'json', signal, stream });
  if (response.error) return { searches: [], result: { verses: [], errors: [] }, references, error: response.error, ...(response.hint ? { hint: response.hint } : {}) };
  const plan = object(parseResponseJson(response.output));
  let searches = normalizeSearches(plan.searches, references);
  const summary = () => searches.map(s => ({ bible_uuid: s.bible_uuid, bible_name: references.find(b => b.uuid === s.bible_uuid)?.name, query_preview: s.text.slice(0, 100), limit: s.limit }));
  emit('plan', { searches: summary() });
  emit('status', { phase: 'searching', message: 'Searching your Bibles…' });
  let result = await searchScripture(searches, db, signal);
  if (!result.verses.length) {
    searches = fallbackSearches(message, references[0]?.uuid);
    emit('plan', { searches: summary() });
    result = await searchScripture(searches, db, signal);
  }
  emit('search_results', { verse_count: result.verses.length, by_bible: references.map(ref => ({ bible_uuid: ref.uuid, bible_name: ref.name, count: result.verses.filter(v => v.bible_uuid === ref.uuid).length })).filter(row => row.count), errors: result.errors });
  return { searches, result, references };
}
export async function studyAssistant(study: Study, message: string, options: { chat?: Chat; db?: typeof prisma; signal?: AbortSignal; stream?: boolean; emit?: EventWriter; target?: number } = {}): Promise<ChatResult | JsonObject> {
  if (!message.trim()) return { error: 'User message is blank.' };
  const db = options.db ?? prisma, chat = options.chat ?? new OllamaClient(), emit = options.emit ?? (() => {});
  emit('started', {});
  const snapshot = await studySnapshot(study, db);
  const plan = await planSearch(message, snapshot, chat, db, options.signal, options.stream, emit);
  if (plan.error) { emit('error', { error: plan.error, hint: plan.hint }); return { error: plan.error, ...(plan.hint ? { hint: plan.hint } : {}) }; }
  emit('status', { phase: 'drafting', message: 'Drafting suggestions…' });
  const response = await chat.run({ system: policy.suggestions, user: suggestionsPrompt(message, snapshot, plan.references, plan.result, options.target), signal: options.signal, stream: options.stream, format: 'json' });
  if (response.error) { emit('error', response); return response; }
  const suggestions = await normalizeSuggestions(suggestionList(parseResponseJson(response.output)), db);
  if (options.target) scaleDurations(suggestions, options.target);
  const result = { suggestions, debug: { searches_requested: plan.searches, search_errors: plan.result.errors, verses_returned: plan.result.verses.length, reference_bibles: plan.references } };
  emit('complete', result);
  return result;
}
