/** Match pg_search's simple tsearch scope: OR whitespace terms, preserving each
 * quoted term's PostgreSQL punctuation/phrase parsing and prefix matching.
 * This value must be passed as a SQL parameter, never interpolated into SQL text.
 */
export function searchTerms(query: string): string {
  return query.normalize('NFC').split(/\s+/u).filter(Boolean)
    .map(term => `' ${term.replace(/['?\\:]/g, ' ')} ':*`).join(' | ');
}
