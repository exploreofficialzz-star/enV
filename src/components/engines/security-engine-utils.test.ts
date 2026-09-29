import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateStrength, generatePassword } from './security-engine-utils.ts';

test('password generator produces requested length and selected character sets', () => {
  const value = generatePassword({ length: '24', lower: 'true', upper: 'true', numbers: 'true', symbols: 'true' });
  assert.equal(value.length, 24);
  assert.match(value, /[a-z]/); assert.match(value, /[A-Z]/); assert.match(value, /\d/); assert.match(value, /[^A-Za-z0-9]/);
});

test('password generator rejects invalid length', () => {
  assert.throws(() => generatePassword({ length: '7' }), /between 8 and 256/);
  assert.throws(() => generatePassword({ length: '257' }), /between 8 and 256/);
});

test('password strength detects common weak patterns', () => {
  const weak = estimateStrength('password123');
  assert.equal(weak.score, 0);
  assert.ok(weak.tips.some((x) => /common words/i.test(x)));
  assert.ok(estimateStrength('A-longer-random-example-47!').entropy > 40);
});
