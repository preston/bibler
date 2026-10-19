import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultStudyViewMode } from '../dist/index.js';

test('study roles preserve their enum contract and select the permitted view', () => {
  assert.equal(defaultStudyViewMode({ myStudyRole: 'owner' }), 'leader');
  assert.equal(defaultStudyViewMode({ myStudyRole: 'co_leader' }), 'co-leader');
  assert.equal(defaultStudyViewMode({ myStudyRole: 'participant', availableStudyModes: ['participant'] }), 'participant');
  assert.equal(defaultStudyViewMode({ availableStudyModes: ['leader', 'participant'] }), 'leader');
  assert.equal(defaultStudyViewMode({ availableStudyModes: ['co-leader', 'participant'] }), 'co-leader');
  assert.equal(defaultStudyViewMode({}), 'participant');
});
