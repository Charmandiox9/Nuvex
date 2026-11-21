import { expect, test } from 'vitest';
import { runPool } from './pool';

test('respeta el limite y procesa todos los elementos', async () => {
  const items = Array.from({ length: 9 }, (_, index) => index);
  let active = 0;
  let peak = 0;
  const seen: number[] = [];
  await runPool(items, 3, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    seen.push(item);
    active -= 1;
  });
  expect(peak).toBeLessThanOrEqual(3);
  expect(peak).toBeGreaterThan(1);
  expect(seen.sort((a, b) => a - b)).toEqual(items);
});

test('lista vacia no ejecuta nada', async () => {
  let calls = 0;
  await runPool([], 3, async () => { calls += 1; });
  expect(calls).toBe(0);
});
