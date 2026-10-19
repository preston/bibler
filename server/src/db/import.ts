// Author: Preston Lee

import { createReadStream } from 'node:fs';
import { readFile, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';
import { Pool } from 'pg';
import { prisma, databaseUrl } from './prisma.ts';

const oldBooks = new Set('genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|1 samuel|2 samuel|1 kings|2 kings|1 chronicles|2 chronicles|ezra|nehemiah|esther|job|psalms|proverbs|ecclesiastes|song of solomon|isaiah|jeremiah|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi'.split('|'));
const newBooks = new Set('matthew|mark|luke|john|acts|romans|1 corinthians|2 corinthians|galatians|ephesians|philippians|colossians|1 thessalonians|2 thessalonians|1 timothy|2 timothy|titus|philemon|hebrews|james|1 peter|2 peter|1 john|2 john|3 john|jude|revelation'.split('|'));

export function bookLookupKey(name: string): string {
  return name.trim().replace(/\bIII\s+/gi, '3 ').replace(/\bII\s+/gi, '2 ').replace(/\bI\s+/gi, '1 ').toLowerCase();
}

export function classifyTestament(name: string): string {
  const key = bookLookupKey(name);
  return oldBooks.has(key) ? 'old' : newBooks.has(key) ? 'new' : 'other';
}

interface VerseRow { bookId: string; chapter: number; ordinal: number; text: string }

export async function importBibles(basePath: string, selected?: Set<string>): Promise<void> {
  const manifest = await readFile(join(basePath, 'docs/main_readme/translation_list.md'), 'utf8');
  const translations = [...manifest.matchAll(/^-\s+\*\*(\w+)\s+\(([^)]+)\)\*\*:\s+(.+)$/gm)];
  if (!translations.length) throw new Error('Translation manifest contains no translations.');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    for (const entry of translations) {
      const abbreviation = entry[1]!, language = entry[2]!, name = entry[3]!.trim();
      if (selected && !selected.has(abbreviation)) continue;
      const csvFile = join(basePath, 'formats/csv', `${abbreviation}.csv`);
      try { await access(csvFile); } catch { throw new Error(`Missing translation CSV: ${abbreviation}`); }
      let license = '';
      try {
        const source = await readFile(join(basePath, 'sources', language, abbreviation, 'README.md'), 'utf8');
        license = source.match(/^\*\*License:\*\*\s*(.+)$/m)?.[1]?.trim() ?? '';
      } catch { /* Some upstream translations do not include license metadata. */ }
      const existing = await prisma.bible.findUnique({ where: { abbreviation } });
      const now = new Date();
      const bible = existing ? await prisma.bible.update({ where: { id: existing.id }, data: {
        name, language, license, ...(existing.name !== name || existing.language !== language || existing.license !== license ? { updatedAt: now } : {})
      } }) : await prisma.bible.create({ data: { abbreviation, language, name, license, createdAt: now, updatedAt: now } });
      const books = new Map<string, string>();
      let batch: VerseRow[] = [], count = 0;
      const flush = async (): Promise<void> => {
        if (!batch.length) return;
        await pool.query(`INSERT INTO verses (bible_id, book_id, chapter, ordinal, text, created_at, updated_at)
          SELECT $1::uuid, v."bookId"::uuid, v.chapter, v.ordinal, v.text, $3::timestamp, $3::timestamp
          FROM jsonb_to_recordset($2::jsonb) AS v("bookId" text, chapter int, ordinal int, text text)
          ON CONFLICT (bible_id,book_id,chapter,ordinal) DO UPDATE SET text=EXCLUDED.text, updated_at=EXCLUDED.updated_at
          WHERE verses.text IS DISTINCT FROM EXCLUDED.text`, [bible.id, JSON.stringify(batch), new Date().toISOString()]);
        count += batch.length;
        batch = [];
      };
      const rows = createReadStream(csvFile).pipe(parse({ columns: true, bom: true, skip_empty_lines: true }));
      for await (const raw of rows) {
        const row = raw as Record<string, string>;
        const bookName = row.Book, chapter = Number(row.Chapter), ordinal = Number(row.Verse), text = row.Text;
        if (!bookName || !Number.isInteger(chapter) || chapter < 1 || !Number.isInteger(ordinal) || ordinal < 1 || text === undefined) throw new Error(`Invalid source row in ${abbreviation} after ${count + batch.length} verses.`);
        let bookId = books.get(bookName);
        if (!bookId) {
          const prior = await prisma.book.findUnique({ where: { bibleId_name: { bibleId: bible.id, name: bookName } } });
          const position = books.size + 1, testament = classifyTestament(bookName);
          const book = prior ? await prisma.book.update({ where: { id: prior.id }, data: {
            ordinal: position, testament, ...(prior.ordinal !== position || prior.testament !== testament ? { updatedAt: new Date() } : {})
          } }) : await prisma.book.create({ data: { bibleId: bible.id, name: bookName, ordinal: position, testament, createdAt: new Date(), updatedAt: new Date() } });
          bookId = book.id; books.set(bookName, bookId);
        }
        batch.push({ bookId, chapter, ordinal, text });
        if (batch.length >= 500) await flush();
      }
      await flush();
      console.log(`${abbreviation}: ${books.size} books, ${count} verses`);
    }
    if (selected) for (const abbreviation of selected) {
      if (!translations.some(t => t[1] === abbreviation)) throw new Error(`Unknown translation: ${abbreviation}`);
    }
  } finally { await pool.end(); }
}

if (import.meta.main) {
  const path = resolve(process.env.BIBLER_SERVER_BIBLE_DATABASES_PATH ?? fileURLToPath(new URL('../../../../bible_databases/', import.meta.url)));
  const list = process.env.BIBLER_SERVER_IMPORT_TRANSLATIONS?.split(',').map(s => s.trim()).filter(Boolean);
  try { await importBibles(path, list?.length ? new Set(list) : undefined); } finally { await prisma.$disconnect(); }
}
