import { prisma } from '../db/prisma.ts';
import { languageNames } from './languages.ts';
import { toolDefinitions } from './definitions.ts';
export { toolDefinitions };
export class ToolError extends Error { readonly code: number; constructor(message: string, code: number) { super(message); this.code = code; } }
type Args = Record<string, unknown>;
export const validUuid = (value: unknown): boolean => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value ?? ''));
const absent = (value: unknown) => value === null || value === undefined || value === false || (typeof value === 'string' && !value.trim());
const content = (value: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
export function searchTerms(query: string): string {
  return (query.normalize('NFC').match(/[\p{L}\p{N}]+/gu) ?? []).map(term => `${term}:*`).join(' | ');
}
export async function callTool(name: string, args: Args, db = prisma): Promise<ReturnType<typeof content>> {
  const definition = toolDefinitions.find(tool => tool.name === name);
  if (!definition) throw new ToolError(`Unknown tool: ${name}`, -32602);
  for (const required of definition.inputSchema.required) if (absent(args[required])) throw new ToolError(`${required} is required`, -32602);
  if (name === 'list_bibles') {
    const rows = await db.bible.findMany({ where: args.language ? { language: String(args.language) } : {}, orderBy: { name: 'asc' } });
    return content(rows.map(bible => ({ uuid: bible.id, name: bible.name, abbreviation: bible.abbreviation, language: bible.language, license: bible.license })));
  }
  if (name === 'list_languages') {
    const rows = await db.bible.findMany({ distinct: ['language'], orderBy: { language: 'asc' }, select: { language: true } });
    return content(rows.map(bible => ({ code: bible.language, name: languageNames[bible.language] ?? bible.language.toUpperCase() })));
  }
  if (args.bible && !validUuid(args.bible)) throw new ToolError(`Bible not found: ${String(args.bible)}`, -32001);
  const bible = args.bible ? await db.bible.findFirst({ where: { id: String(args.bible) } }) : null;
  if (args.bible && !bible) throw new ToolError(`Bible not found: ${String(args.bible)}`, -32001);
  if (name === 'list_books') {
    const books = await db.book.findMany({ where: bible ? { bibleId: bible.id } : {} });
    const bibles = await db.bible.findMany({ where: { id: { in: [...new Set(books.map(b => b.bibleId!))] } } });
    const names = new Map(bibles.map(b => [b.id, b.name]));
    const testamentOrder = (value: string) => value === 'old' ? 0 : value === 'new' ? 1 : 2;
    books.sort((a, b) => (bible ? 0 : String(a.bibleId).localeCompare(String(b.bibleId))) || testamentOrder(a.testament) - testamentOrder(b.testament) || Number(a.ordinal ?? 0) - Number(b.ordinal ?? 0));
    return content(books.map(book => ({ uuid: book.id, name: book.name, ordinal: book.ordinal, testament: book.testament, bible: names.get(book.bibleId!) })));
  }
  if (!bible) throw new ToolError('bible is required', -32602);
  if (name === 'search_verses') {
    const query = searchTerms(String(args.query));
    const limit = args.limit === undefined ? 100 : Number(args.limit);
    if (!Number.isSafeInteger(limit) || limit < 0) throw new ToolError('limit must be a nonnegative integer', -32602);
    if (!query || limit === 0) return content([]);
    const rows = await db.$queryRaw<Array<{ text: string | null; chapter: number; ordinal: number; name: string }>>`
      SELECT v.text, v.chapter, v.ordinal, b.name FROM verses v JOIN books b ON b.id = v.book_id
      WHERE v.bible_id = ${bible.id}::uuid AND to_tsvector('simple', coalesce(v.text, '')) @@ to_tsquery('simple', ${query})
      ORDER BY v.book_id ASC, v.chapter ASC, v.ordinal ASC LIMIT ${limit}`;
    return content(rows.map(v => ({ reference: `${v.name} ${v.chapter}:${v.ordinal}`, text: v.text, book: v.name, chapter: v.chapter, verse: v.ordinal, bible: bible.name })));
  }
  if (!validUuid(args.book)) throw new ToolError(`Book not found: ${String(args.book)}`, -32001);
  const book = await db.book.findFirst({ where: { id: String(args.book), bibleId: bible.id } });
  if (!book) throw new ToolError(`Book not found: ${String(args.book)}`, -32001);
  if (name === 'get_book_info') {
    const rows = await db.verse.findMany({ where: { bibleId: bible.id, bookId: book.id }, distinct: ['chapter'], orderBy: { chapter: 'asc' }, select: { chapter: true } });
    const chapters = rows.map(v => v.chapter);
    return content({ uuid: book.id, name: book.name, ordinal: book.ordinal, testament: book.testament, bible: { uuid: bible.id, name: bible.name, abbreviation: bible.abbreviation }, chapters, chapter_count: chapters.length });
  }
  const chapter = Math.trunc(Number(args.chapter)) || 0;
  if (name === 'get_chapter') {
    const verses = await db.verse.findMany({ where: { bibleId: bible.id, bookId: book.id, chapter }, orderBy: { ordinal: 'asc' } });
    return content({ reference: `${book.name} ${chapter}`, verses: verses.map(v => ({ verse: v.ordinal, text: v.text })), book: book.name, chapter, bible: bible.name });
  }
  const ordinal = Math.trunc(Number(args.verse)) || 0;
  const verse = await db.verse.findFirst({ where: { bibleId: bible.id, bookId: book.id, chapter, ordinal } });
  if (!verse) throw new ToolError(`Verse not found: ${book.name} ${chapter}:${ordinal}`, -32001);
  return content({ reference: `${book.name} ${chapter}:${ordinal}`, text: verse.text, book: book.name, chapter, verse: ordinal, bible: bible.name, testament: book.testament });
}
