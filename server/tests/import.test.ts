// Author: Preston Lee

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { bookLookupKey, classifyTestament } from '../src/db/import.ts';
import { prisma } from '../src/db/prisma.ts';

after(() => prisma.$disconnect());
test('import matching classifies Roman numeral aliases without changing stored names', () => {
  assert.equal(bookLookupKey('III John'), '3 john');
  assert.equal(classifyTestament('II Samuel'), 'old');
  assert.equal(classifyTestament('III John'), 'new');
  assert.equal(classifyTestament('Tobit'), 'other');
});
