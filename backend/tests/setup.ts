import { beforeAll, afterAll } from 'vitest';
import { getSql } from './helpers.js';

beforeAll(async () => {
  await getSql();
});

afterAll(async () => {
  const { closeSql } = await import('./helpers.js');
  await closeSql();
});
