import test from 'node:test';
import assert from 'node:assert/strict';
import { createMediaJobAdmission } from './media/processor-admission.mjs';

test('media admission caps concurrent work and releases idempotently', () => {
  const gate = createMediaJobAdmission(1);
  const release = gate.tryEnter();
  assert.equal(typeof release, 'function');
  assert.equal(gate.activeJobs, 1);
  assert.equal(gate.tryEnter(), null);
  release(); release();
  assert.equal(gate.activeJobs, 0);
  assert.equal(typeof gate.tryEnter(), 'function');
});

test('media admission clamps unsafe or invalid configured concurrency', () => {
  assert.equal(createMediaJobAdmission(0).maxConcurrentJobs, 1);
  assert.equal(createMediaJobAdmission(999).maxConcurrentJobs, 16);
  assert.equal(createMediaJobAdmission(Number.NaN).maxConcurrentJobs, 1);
});
