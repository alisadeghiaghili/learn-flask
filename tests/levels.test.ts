/**
 * Level catalog and victory-condition tests.
 *
 * Every shipped level's solutionCode must pass its own checks.
 */

import { describe, expect, it } from 'vitest';
import { parseFlaskSource } from '../src/parser/flaskParser';
import { checkLevel } from '../src/model/levels';
import { allLevels, findLevel, SERIES } from '../src/levels/catalog';

describe('level catalog', () => {
  it('exposes the full curriculum with levels', () => {
    expect(SERIES.length).toBeGreaterThanOrEqual(6);
    expect(allLevels().length).toBeGreaterThanOrEqual(20);
  });

  it('findLevel resolves ids', () => {
    expect(findLevel('hello-route')?.title).toBe('Hello, Route');
    expect(findLevel('missing')).toBeNull();
  });

  it('starter code is intentionally incomplete (solutions differ)', () => {
    for (const level of allLevels()) {
      if (!level.solutionCode) continue;
      // Starter should not already be a passing solution for request-only levels
      // (route levels may share some routes). Soft check: starter !== solution.
      expect(level.starterCode).not.toBe(level.solutionCode);
    }
  });
});

describe('level solutions pass checks', () => {
  for (const level of allLevels()) {
    it(`solution for ${level.id}`, () => {
      expect(level.solutionCode, `level ${level.id} needs a solution`).toBeTruthy();
      const app = parseFlaskSource(level.solutionCode!);
      const result = checkLevel(app, level);
      expect(result.failures).toEqual([]);
      expect(result.ok).toBe(true);
    });
  }
});

describe('checkLevel failures', () => {
  it('flags missing routes', () => {
    const level = findLevel('hello-route')!;
    const app = parseFlaskSource('app = Flask(__name__)\n');
    const result = checkLevel(app, level);
    expect(result.ok).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
  });
});
