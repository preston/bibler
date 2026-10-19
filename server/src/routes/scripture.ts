import { Router } from 'express';
import { prisma } from '../db/prisma.ts';
import { notFound, param, string } from '../http.ts';
import { bibleJson, bookJson } from '../services/serializers.ts';
import { searchTerms } from '../services/search.ts';

export function createScriptureRouter() {
  const router = Router();
  router.get('/bibles', async (_req, res) => res.json((await prisma.bible.findMany()).map(bibleJson)));
  router.get('/bibles/:bible', async (req, res) => {
    const bible = await prisma.bible.findUnique({ where: { id: param(req, 'bible') } }) ?? notFound('Bible');
    const json = bibleJson(bible);
    if (string(req.query.include).split(',').includes('books')) {
      const books = sortBooks(await prisma.book.findMany({ where: { bibleId: bible.id } }));
      res.json({ ...json, books: await Promise.all(books.map(bookJson)) });
    } else res.json(json);
  });
  router.get(['/books', '/bibles/:bible/books'], async (req, res) => {
    const bibleId = param(req, 'bible');
    if (bibleId && !await prisma.bible.findUnique({ where: { id: bibleId } })) notFound('Bible');
    const books = await prisma.book.findMany({ where: bibleId ? { bibleId } : {} });
    res.json(await Promise.all(sortBooks(books).map(bookJson)));
  });
  router.get(['/books/:book', '/bibles/:bible/books/:book'], async (req, res) => {
    const book = await prisma.book.findFirst({ where: { id: param(req, 'book'), ...(param(req, 'bible') ? { bibleId: param(req, 'bible') } : {}) } }) ?? notFound('Book');
    res.json(await bookJson(book));
  });
  router.get('/bibles/:bible/books/:book/chapters', async (req, res) => {
    await context(param(req, 'bible'), param(req, 'book'));
    const rows = await prisma.verse.findMany({ where: { bibleId: param(req, 'bible'), bookId: param(req, 'book') }, select: { chapter: true }, distinct: ['chapter'], orderBy: { chapter: 'asc' } });
    res.json(rows.map((r) => r.chapter));
  });
  router.get('/bibles/:bible/books/:book/chapters/:chapter/verses', async (req, res) => {
    await context(param(req, 'bible'), param(req, 'book'));
    const rows = await prisma.verse.findMany({ where: { bibleId: param(req, 'bible'), bookId: param(req, 'book'), chapter: Number(param(req, 'chapter')) || 0 }, orderBy: { ordinal: 'asc' } });
    res.json(rows.map((r) => ({ ...r, uuid: r.id })));
  });
  router.get('/bibles/:bible/books/:book/chapters/:chapter/verses/:ordinal', async (req, res) => {
    const { bible, book } = await context(param(req, 'bible'), param(req, 'book'));
    const verse = await prisma.verse.findFirst({ where: { bibleId: bible.id, bookId: book.id, chapter: Number(param(req, 'chapter')) || 0, ordinal: Number(param(req, 'ordinal')) || 0 } });
    res.json(verse ? { ...verse, uuid: verse.id, bible: bibleJson(bible), book: await bookJson(book) } : null);
  });
  router.post('/bibles/:bible/search', async (req, res) => {
    const bibleId = param(req, 'bible');
    if (!await prisma.bible.findUnique({ where: { id: bibleId } })) notFound('Bible');
    const text = string(req.body?.text || req.query.text).trim();
    const query = searchTerms(text);
    if (!query) { res.json([]); return; }
    const ids = await prisma.$queryRaw<Array<{ id: string }>>`SELECT id FROM verses WHERE bible_id = ${bibleId}::uuid AND to_tsvector('simple', COALESCE(text, '')) @@ to_tsquery('simple', ${query}) ORDER BY ts_rank(to_tsvector('simple', COALESCE(text, '')), to_tsquery('simple', ${query})) DESC, id ASC LIMIT 100`;
    const rows = await prisma.verse.findMany({ where: { id: { in: ids.map((r) => r.id) } } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    res.json(await Promise.all(ids.map(async ({ id }) => {
      const verse = byId.get(id)!;
      const book = await prisma.book.findUnique({ where: { id: verse.bookId } });
      return { ...verse, uuid: verse.id, book: book ? await bookJson(book) : null };
    })));
  });
  return router;
}

async function context(bibleId: string, bookId: string) {
  const bible = await prisma.bible.findUnique({ where: { id: bibleId } }) ?? notFound('Bible');
  const book = await prisma.book.findFirst({ where: { id: bookId, bibleId } }) ?? notFound('Book');
  return { bible, book };
}
function sortBooks<T extends { bibleId: string; testament: string; ordinal: number }>(books: T[]): T[] {
  const rank = (testament: string) => testament === 'old' ? 0 : testament === 'new' ? 1 : 2;
  return books.sort((a, b) => a.bibleId.localeCompare(b.bibleId) || rank(a.testament) - rank(b.testament) || a.ordinal - b.ordinal);
}
