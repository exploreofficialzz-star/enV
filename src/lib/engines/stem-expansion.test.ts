import test from 'node:test';
import assert from 'node:assert/strict';
import { stemCalculators } from './stem-calculators.ts';

const value = (id: string, input: Record<string, unknown>) => {
  const calculator = stemCalculators[id];
  assert.ok(calculator, `missing calculator ${id}`);
  const values = Object.fromEntries(Object.entries(input).map(([key, item]) => [key, String(item)]));
  const result = calculator.compute(values);
  assert.ok(result.length > 0, `${id} returned no results`);
  return Number(String(result[0].value).replace(/,/g, ''));
};

test('advanced STEM calculators return expected values', () => {
  assert.ok(Math.abs(value('physics-projectile-range', { v0: 20, theta: 45, g: 9.80665 }) - 40.78865) < 0.001);
  assert.equal(value('calculus-derivative-power', { coefficient: 3, exponent: 4 }), 12);
  assert.equal(value('statistics-z-score', { x: 85, mean: 75, sd: 5 }), 2);
  assert.ok(Math.abs(value('structures-euler-buckling-load', { E: 200e9, I: 1e-6, K: 1, L: 2 }) - 493480.22) < 0.1);
  assert.ok(Math.abs(value('electrical-resonant-frequency-lc', { L: 0.001, C: 1e-6 }) - 5032.921) < 0.01);
  assert.ok(Math.abs(value('thermal-ideal-gas-pressure', { n: 1, R: 8.314462618, T: 300, V: 0.024465 }) - 101955.4) < 1);
});

test('advanced STEM calculators reject invalid engineering inputs', () => {
  assert.throws(() => value('engineering-hollow-circle-section-modulus', { D: 10, d: 10 }));
  assert.throws(() => value('physics-relativistic-gamma', { v: 299792458, c: 299792458 }));
  assert.throws(() => value('thermal-carnot-efficiency', { Th: 300, Tc: 300 }));
  assert.throws(() => value('electrical-led-series-resistor', { Vs: 2, Vf: 3, I: 0.02 }));
});
