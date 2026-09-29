import test from 'node:test';
import assert from 'node:assert/strict';
import { stemCalculators } from './stem-calculators.ts';

const first = (id: string, values: Record<string, string>) => Number(stemCalculators[id]!.compute(values)[0]!.value.replace(/,/g, ''));

test('physics calculators return expected values', () => {
  assert.equal(first('physics-newtons-second-law', { m: '10', a: '2' }), 20);
  assert.equal(first('physics-momentum', { m: '4', v: '3' }), 12);
  assert.equal(first('physics-wave-speed', { f: '50', lambda: '2' }), 100);
});

test('mechanical calculators return expected values', () => {
  assert.ok(Math.abs(first('mechanical-power-torque-rpm', { tau: '100', rpm: '3000' }) - 31415.92653589793) < 1e-6);
  assert.equal(first('mechanical-gear-ratio', { driverTeeth: '20', drivenTeeth: '40' }), 2);
  assert.equal(first('mechanical-safety-factor', { strength: '400', stress: '100' }), 4);
});

test('electrical calculators validate and calculate', () => {
  assert.equal(first('electrical-series-resistance', { R1: '10', R2: '20', R3: '', R4: '' }), 30);
  assert.ok(Math.abs(first('electrical-parallel-resistance', { R1: '10', R2: '20', R3: '', R4: '' }) - 6.666666666666667) < 1e-10);
  assert.equal(first('electrical-voltage-divider', { Vin: '12', R1: '1000', R2: '1000' }), 6);
  assert.throws(() => stemCalculators['electrical-ohms-law']!.compute({ V: '10', I: '', R: '0' }), /Resistance cannot be 0/);
});

test('engineering section calculators validate geometry', () => {
  assert.ok(Math.abs(first('engineering-solid-circle-inertia', { d: '2' }) - Math.PI) < 1e-10);
  assert.throws(() => stemCalculators['engineering-hollow-circle-inertia']!.compute({ D: '10', d: '10' }), /smaller than/);
  assert.ok(Math.abs(first('engineering-trapezoid-area', { a: '4', b: '6', h: '5' }) - 25) < 1e-10);
});

test('deep STEM expansion calculators return expected values', () => {
  assert.equal(first('math-matrix-2x2-determinant', { a: '1', b: '2', c: '3', d: '4' }), -2);
  assert.equal(first('math-vector-3d-magnitude', { x: '2', y: '3', z: '6' }), 7);
  assert.ok(Math.abs(first('physics-electric-field-point-charge', { q: '1e-6', r: '0.1', k: '8.9875517923e9' }) - 898755.17923) < 0.01);
  assert.ok(Math.abs(first('mechanical-bending-stress', { M: '1000', c: '0.05', I: '1e-6' }) - 50000000) < 1e-6);
  assert.ok(Math.abs(first('fluid-darcy-friction-factor-laminar', { Re: '1000' }) - 0.064) < 1e-12);
  assert.ok(Math.abs(first('thermal-heat-exchanger-lmtd', { deltaT1: '20', deltaT2: '10' }) - 14.426950408889635) < 1e-10);
  assert.ok(Math.abs(first('electrical-transformer-secondary-voltage', { V1: '240', N1: '1000', N2: '100' }) - 24) < 1e-12);
  assert.ok(Math.abs(first('control-first-order-step-response', { K: '2', tau: '5', t: '5' }) - 1.2642411176571153) < 1e-10);
  assert.ok(Math.abs(first('automotive-braking-force', { mass: '1500', deceleration: '8' }) - 12000) < 1e-12);
  assert.ok(Math.abs(first('civil-earthwork-trapezoidal-volume', { area1: '10', area2: '20', length: '5' }) - 75) < 1e-12);
});

test('deep STEM expansion rejects unsafe or invalid inputs', () => {
  assert.throws(() => stemCalculators['math-matrix-2x2-inverse']!.compute({ a: '1', b: '2', c: '2', d: '4' }), /singular/);
  assert.throws(() => stemCalculators['thermal-radiation-power']!.compute({ emissivity: '1.5', area: '1', T: '300', sigma: '5.67e-8' }), /Emissivity/);
  assert.throws(() => stemCalculators['electrical-transformer-current']!.compute({ I1: '2', V1: '240', V2: '120', efficiency: '0' }), /Efficiency/);
  assert.throws(() => stemCalculators['control-first-order-time-to-percent']!.compute({ tau: '2', percent: '100' }), /between 0 and 100/);
});
