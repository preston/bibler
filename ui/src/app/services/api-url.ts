/** BIBLER_SERVER_URL remains a server origin; resource services use this API base. */
export function apiBaseUrl(origin: string): string {
  const normalized = origin.trim().replace(/\/+$/, '');
  return normalized ? `${normalized}/api` : '';
}

export function scriptureBookPath(bibleUuid: string, bookUuid: string): string {
  return `/bibles/${encodeURIComponent(bibleUuid)}/books/${encodeURIComponent(bookUuid)}`;
}

export function scriptureVersesPath(bibleUuid: string, bookUuid: string, chapter: number, ordinal?: number): string {
  const chapterPath = `${scriptureBookPath(bibleUuid, bookUuid)}/chapters/${chapter}/verses`;
  return ordinal === undefined ? chapterPath : `${chapterPath}/${ordinal}`;
}
