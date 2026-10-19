// Author: Preston Lee

import { Book } from '../models/book';

/** Positive integer from URL query segment (chapter / verse ordinal). */
export function parsePositiveIntQueryParam(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function canNavigateToPreviousPrimaryChapter(
  books: Book[],
  chapters: number[],
  chapter: number | null,
  currentBook: Book | null
): boolean {
  if (!currentBook || chapter === null || chapters.length === 0) return false;
  const chapterIndex = chapters.indexOf(chapter);
  if (chapterIndex > 0) return true;
  if (chapterIndex === -1) return false;
  const bookIndex = books.findIndex((book) => book.uuid === currentBook.uuid);
  return bookIndex > 0;
}

export function canNavigateToNextPrimaryChapter(
  books: Book[],
  chapters: number[],
  chapter: number | null,
  currentBook: Book | null
): boolean {
  if (!currentBook || chapter === null || chapters.length === 0) return false;
  const chapterIndex = chapters.indexOf(chapter);
  if (chapterIndex !== -1 && chapterIndex < chapters.length - 1) return true;
  if (chapterIndex === -1) return false;
  const bookIndex = books.findIndex((book) => book.uuid === currentBook.uuid);
  return bookIndex !== -1 && bookIndex < books.length - 1;
}

/** Previous or next book in canonical order, or null if none. */
export function adjacentPrimaryBook(books: Book[], currentBook: Book | null, offset: -1 | 1): Book | null {
  if (!currentBook) return null;
  const currentIndex = books.findIndex((b) => b.uuid === currentBook.uuid);
  if (currentIndex === -1) return null;
  const targetIndex = currentIndex + offset;
  if (targetIndex < 0 || targetIndex >= books.length) return null;
  return books[targetIndex];
}
