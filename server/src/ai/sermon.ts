import type { Sermon } from '@prisma/client';
import { prisma } from '../db/prisma.ts';
import { type Chat, type JsonObject, integerEnv, object, parseResponseJson } from './client.ts';
import { policy } from './prompts.ts';
import { planSearch, scaleDurations } from './study.ts';
export type SermonOptions = { chat: Chat; db?: typeof prisma; signal?: AbortSignal; documents?: string[]; target?: number; replaceSections?: boolean };
const positive = (value: unknown) => Math.max(0, Math.round(Number(value)) || 0);
const targetMinutes = (sermon: Sermon, target?: number) => target && target > 0 ? target : sermon.targetDurationMinutes && sermon.targetDurationMinutes > 0 ? sermon.targetDurationMinutes : undefined;
function budget(name: string, quantity: number, per: number, base: number, floor: number, cap: number) {
  return Math.min(integerEnv(`${name}_MAX`, cap), Math.max(integerEnv(`${name}_FLOOR`, floor), quantity * integerEnv(`${name}_PER_${name.includes('GROUP') ? 'VERSE' : 'MINUTE'}`, per) + integerEnv(`${name}_BASE`, base)));
}
async function libraryExcerpts(sermon: Sermon, options: SermonOptions) {
  if (!options.documents?.length) return [];
  const rows = await (options.db ?? prisma).document.findMany({ where: { userId: sermon.userId, id: { in: options.documents } } });
  return rows.map(doc => ({ uuid: doc.id, filename: doc.originalFilename, text: doc.extractedText.slice(0, 240000) }));
}
export async function sermonVersePass(sermon: Sermon, message: string, options: SermonOptions): Promise<JsonObject> {
  if (!message.trim()) return { error: 'User message is blank.' };
  const db = options.db ?? prisma, excerpts = await libraryExcerpts(sermon, options);
  const snapshot = { study: { uuid: sermon.id, title: sermon.title, goal: 'Sermon preparation', visibility: sermon.visibility, plan_total_duration_minutes: 0 }, library_file_excerpts: excerpts, verses: [], commentaries: [], questions: [], tasks: [] };
  const plan = await planSearch(message, snapshot, options.chat, db, options.signal, false, undefined, true);
  if (plan.error) return { error: plan.error, hint: plan.hint };
  if (!plan.result.verses.length) return { error: 'No verses found in database for this request.' };
  const target = targetMinutes(sermon, options.target);
  const response = await options.chat.run({ system: policy.sermonGroup,
    user: `Group DATABASE_VERSES into 2–8 thematic sermon sections for the preacher request. Output JSON only: {"sections":[{"title":"short title (<=80 chars)","estimated_minutes":5,"verse_uuids":["uuid-from-database"]}]}. Include every verse_uuid once, or omit weak duplicates intentionally. Each estimated_minutes is a positive integer. ${target ? `Their SUM MUST equal ${target} minutes exactly.` : 'Allocate reasonable preaching time to every block.'}\nUSER_MESSAGE:\n${message}\nLIBRARY_EXCERPTS (user notes, not scripture):\n${JSON.stringify(excerpts, null, 2)}\nDATABASE_VERSES:\n${JSON.stringify(plan.result.verses, null, 2)}`,
    format: 'json', options: { num_predict: budget('BIBLER_SERMON_SECTION_GROUP_NUM_PREDICT', plan.result.verses.length, 500, 20000, 102400, 327680) }, signal: options.signal });
  if (response.error) return { error: response.error, hint: response.hint };
  const raw = object(parseResponseJson(response.output));
  if (!Array.isArray(raw.sections)) return { error: 'Could not parse section groups from model output.' };
  const allowed = new Map(plan.result.verses.map(v => [v.verse_uuid, v]));
  const sections = raw.sections.flatMap(input => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return [];
    const sec = object(input), ids = Array.isArray(sec.verse_uuids ?? sec.verseUuids) ? sec.verse_uuids ?? sec.verseUuids : [];
    return [{ title: String(sec.title || 'Section').slice(0, 200), estimated_minutes: positive(sec.estimated_minutes ?? sec.estimatedMinutes), verses: (ids as unknown[]).flatMap(id => allowed.has(String(id)) ? [allowed.get(String(id))!] : []) }];
  });
  if (!sections.length) return { error: 'Model produced no valid sections from database verses.' };
  const total = sections.reduce((sum, s) => sum + s.estimated_minutes, 0);
  if (target || !total) scaleDurations(sections, target ?? Math.max(5 * sections.length, 15), 'estimated_minutes');
  options.signal?.throwIfAborted();
  const persisted = await db.$transaction(async tx => {
    if (options.replaceSections ?? true) {
      const old = await tx.sermonSection.findMany({ where: { sermonId: sermon.id }, select: { id: true } });
      await tx.sermonSectionVerse.deleteMany({ where: { sermonSectionId: { in: old.map(s => s.id) } } });
      await tx.sermonSection.deleteMany({ where: { sermonId: sermon.id } });
    }
    const built = [];
    for (const [position, section] of sections.entries()) {
      const now = new Date();
      const sec = await tx.sermonSection.create({ data: { sermonId: sermon.id, title: section.title, body: '', position, estimatedMinutes: Math.max(1, section.estimated_minutes), createdAt: now, updatedAt: now } });
      const verseRows = [];
      for (const [versePosition, v] of section.verses.entries()) {
        verseRows.push(await tx.sermonSectionVerse.create({ data: { sermonSectionId: sec.id, bibleUuid: v.bible_uuid, bookUuid: v.book_uuid, chapter: v.chapter, ordinal: v.ordinal, verseUuid: v.verse_uuid, verseText: v.text, position: versePosition, createdAt: now, updatedAt: now } }));
      }
      built.push({ uuid: sec.id, title: sec.title, body: sec.body, position: sec.position, estimated_minutes: sec.estimatedMinutes, sermon_section_verses: verseRows.map(v => ({ uuid: v.id, verse_uuid: v.verseUuid, bible_uuid: v.bibleUuid, book_uuid: v.bookUuid, chapter: v.chapter, ordinal: v.ordinal, position: v.position, verse_text: v.verseText })) });
    }
    return built;
  });
  return { sections: persisted, search_summary: { verse_count: plan.result.verses.length, errors: plan.result.errors }, debug: { searches: plan.searches } };
}
export async function sermonOutlinePass(sermon: Sermon, message: string, options: SermonOptions): Promise<JsonObject> {
  if (!message.trim()) return { error: 'User message is blank.' };
  const db = options.db ?? prisma;
  const sections = await db.sermonSection.findMany({ where: { sermonId: sermon.id }, orderBy: [{ position: 'asc' }, { id: 'asc' }], include: { sermonSectionVerses: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } } });
  if (!sections.length) return { error: 'Add at least one sermon section with verses before running outline.' };
  if (!sections.some(sec => sec.sermonSectionVerses.length)) return { error: 'Add verses to at least one section before running outline.' };
  const excerpts = await libraryExcerpts(sermon, options), target = targetMinutes(sermon, options.target);
  const verseIds = sections.flatMap(s => s.sermonSectionVerses.flatMap(v => v.verseUuid ? [v.verseUuid] : [])).filter(id => /^[0-9a-f-]{36}$/i.test(id));
  const texts = new Map((verseIds.length ? await db.verse.findMany({ where: { id: { in: verseIds } } }) : []).map(v => [v.id, v.text]));
  const payload = sections.map(sec => ({ section_uuid: sec.id, title: sec.title, body: sec.body, estimated_minutes: sec.estimatedMinutes, verses: sec.sermonSectionVerses.map(v => ({ verse_uuid: v.verseUuid, bible_uuid: v.bibleUuid, book_uuid: v.bookUuid, chapter: v.chapter, ordinal: v.ordinal, text: texts.get(v.verseUuid ?? '') || v.verseText })) }));
  const sermonData = { uuid: sermon.id, title: sermon.title, visibility: sermon.visibility, target_duration_minutes: sermon.targetDurationMinutes };
  const charsPerMinute = integerEnv('BIBLER_SERMON_PROMPT_MIN_CHARS_PER_MINUTE', 900);
  const output: JsonObject[] = [];
  if (/^(true|1|yes)$/i.test(process.env.BIBLER_SERMON_OUTLINE_SINGLE_CALL_JSON ?? 'false')) {
    const sum = Math.max(payload.reduce((n, s) => n + (s.estimated_minutes ?? 0), 0) || target || 0, 5);
    const response = await options.chat.run({ system: policy.sermonOutline,
      user: `Draft complete speakable sermon bodies. Output JSON {"sections":[{"section_uuid":"existing uuid","title":"string","body":"full spoken prose","estimated_minutes":5,"verse_uuids":[]}]}. Include EXACTLY one entry per EXISTING_SECTIONS uuid. Only use verse_uuids from VERSES_FROM_DATABASE. ${target ? `Every estimated_minutes must be positive and their SUM MUST equal ${target}.` : 'Assign reasonable positive estimated_minutes.'}\nPER_SECTION_BODY_LENGTH_FLOORS (mandatory):\n${JSON.stringify(payload.map(s => ({ section_uuid: s.section_uuid, body_must_be_at_least_this_many_characters: Math.max(1, s.estimated_minutes ?? 1) * charsPerMinute })), null, 2)}\nWrite 1–2 substantial paragraphs per estimated minute and 120–200 spoken words per minute; no thin placeholders.\nUSER_MESSAGE:\n${message}\nSERMON:\n${JSON.stringify(sermonData)}\nEXISTING_SECTIONS:\n${JSON.stringify(payload)}\nVERSES_FROM_DATABASE:\n${JSON.stringify(payload.flatMap(s => s.verses))}\nLIBRARY_EXCERPTS (user notes, not scripture):\n${JSON.stringify(excerpts)}`,
      format: 'json', options: { num_predict: budget('BIBLER_SERMON_OUTLINE_NUM_PREDICT', sum, 2200, 60000, 102400, 327680) }, signal: options.signal });
    if (response.error) return { error: response.error, hint: response.hint };
    const parsed = object(parseResponseJson(response.output));
    if (!Array.isArray(parsed.sections)) return { error: 'Could not parse outline from model output.' };
    for (const value of parsed.sections) {
      const row = object(value), uuid = String(row.section_uuid ?? row.sectionUuid ?? '');
      if (!payload.some(p => p.section_uuid === uuid)) continue;
      output.push({ ...row, section_uuid: uuid, estimated_minutes: positive(row.estimated_minutes ?? row.estimatedMinutes) });
    }
    if (output.length !== payload.length || new Set(output.map(s => s.section_uuid)).size !== payload.length) return { error: 'Model outline did not match the existing sermon sections.' };
  } else {
    for (const sec of payload) {
      options.signal?.throwIfAborted();
      const minutes = Math.max(1, sec.estimated_minutes ?? 1), minChars = minutes * charsPerMinute;
      const response = await options.chat.run({ system: policy.sermonBody,
        user: `Write the full speakable sermon body for this ONE section only. ${target ? `Whole-sermon target (context only): ~${target} minutes across all sections.` : ''}\nSECTION_TITLE: ${sec.title}\nESTIMATED_MINUTES_FOR_THIS_SECTION: ${minutes}\nMINIMUM_BODY_CHARACTER_COUNT: ${minChars}\nYour plaintext response MUST contain at least ${minChars} characters. If shorter, keep writing exposition, illustration, application and transitions.\nUSER_MESSAGE (preacher request):\n${message}\nSERMON:\n${JSON.stringify(sermonData, null, 2)}\nLIBRARY_EXCERPTS (user notes; not scripture):\n${JSON.stringify(excerpts, null, 2)}\nVERSES_FROM_DATABASE (scripture for this section):\n${JSON.stringify(sec.verses, null, 2)}`,
        options: { num_predict: budget('BIBLER_SERMON_SECTION_BODY_NUM_PREDICT', minutes, 2200, 8192, 16384, 131072) }, signal: options.signal });
      if (response.error) return { error: response.error, hint: response.hint };
      output.push({ section_uuid: sec.section_uuid, title: sec.title, body: String(response.output ?? '').trim().replace(/^```\w*\s*\n?/, '').replace(/\n?```\s*$/, '').trim(), estimated_minutes: minutes, verse_uuids: sec.verses.flatMap(v => v.verse_uuid ? [v.verse_uuid] : []) });
    }
  }
  const sum = output.reduce((n, row) => n + positive(row.estimated_minutes), 0);
  if (target || !sum) scaleDurations(output, target ?? Math.max(5 * output.length, 15), 'estimated_minutes');
  return { sections: output };
}
