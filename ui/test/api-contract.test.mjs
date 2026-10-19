import assert from 'node:assert/strict';
import test from 'node:test';
import { apiBaseUrl, scriptureBookPath, scriptureVersesPath } from '../src/app/services/api-url.ts';
import { pagedQueryToParams } from '../src/app/services/paged-query-params.ts';

test('configured server origin produces one API base with no doubled slash', () => {
  assert.equal(apiBaseUrl(' https://bibler-server.example/// '), 'https://bibler-server.example/api');
  assert.equal(apiBaseUrl('http://localhost:3000'), 'http://localhost:3000/api');
  assert.equal(apiBaseUrl(''), '');
});

test('scripture routes distinguish book chapters, chapter verses, and a verse ordinal', () => {
  assert.equal(scriptureBookPath('bible-uuid', 'book-uuid'), '/bibles/bible-uuid/books/book-uuid');
  assert.equal(scriptureVersesPath('bible-uuid', 'book-uuid', 3), '/bibles/bible-uuid/books/book-uuid/chapters/3/verses');
  assert.equal(scriptureVersesPath('bible-uuid', 'book-uuid', 3, 16), '/bibles/bible-uuid/books/book-uuid/chapters/3/verses/16');
  assert.equal(scriptureBookPath('a/b', 'c?d'), '/bibles/a%2Fb/books/c%3Fd');
});

test('pagination sends camelCase keys and preserves enum and search values', () => {
  assert.deepEqual(pagedQueryToParams({ q: 'word & light', sort: 'updatedAt', direction: 'desc', page: 2, perPage: 25, scope: 'public' }), {
    q: 'word & light', sort: 'updatedAt', direction: 'desc', page: '2', perPage: '25', scope: 'public'
  });
  assert.deepEqual(pagedQueryToParams(), {});
});
