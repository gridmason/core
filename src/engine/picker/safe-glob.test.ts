import { describe, expect, test } from 'vitest';

import { matchAnyGlob, matchGlob } from './safe-glob.js';

describe('matchGlob literal matching', () => {
  test('an exact literal matches only itself', () => {
    expect(matchGlob('crm.customer-detail', 'crm.customer-detail')).toBe(true);
    expect(matchGlob('crm.customer-detail', 'crm.customer-list')).toBe(false);
  });

  test('regex metacharacters are matched literally, never as regex', () => {
    // `.` is a literal dot, not "any char": `crm.x` must not match `crmYx`.
    expect(matchGlob('crm.x', 'crmYx')).toBe(false);
    expect(matchGlob('crm.x', 'crm.x')).toBe(true);
    // `+`, `(`, `[`, `\` carry no special meaning under glob semantics.
    for (const meta of ['a+b', 'a(b)', 'a[b]', 'a\\b', 'a{b}', 'a^b$']) {
      expect(matchGlob(meta, meta)).toBe(true);
    }
    // A regex quantifier does not expand: `a+` matches the literal `a+` only.
    expect(matchGlob('a+', 'aaa')).toBe(false);
  });

  test('a length mismatch with no wildcard fails', () => {
    expect(matchGlob('ab', 'abc')).toBe(false); // pattern shorter than value
    expect(matchGlob('abc', 'ab')).toBe(false); // pattern longer than value
  });
});

describe('matchGlob wildcards', () => {
  test('`*` matches any run of characters, including across separators', () => {
    expect(matchGlob('dashboards.*', 'dashboards.sales')).toBe(true);
    expect(matchGlob('dashboards.*', 'dashboards.sales.regional')).toBe(true);
    expect(matchGlob('dashboards.*', 'dashboards.')).toBe(true); // matches nothing
    expect(matchGlob('dashboards.*', 'crm.customer')).toBe(false);
  });

  test('`*` matches the empty string and a bare `*` matches anything', () => {
    expect(matchGlob('*', '')).toBe(true);
    expect(matchGlob('*', 'anything.at.all')).toBe(true);
    expect(matchGlob('a*', 'a')).toBe(true); // trailing star absorbs nothing
  });

  test('`*` in the middle backtracks to find a match', () => {
    expect(matchGlob('a*c', 'abxc')).toBe(true);
    expect(matchGlob('a*c', 'abxd')).toBe(false); // no suffix match after backtracking
    expect(matchGlob('a*b*c', 'axbyc')).toBe(true);
  });

  test('`?` matches exactly one character', () => {
    expect(matchGlob('a?c', 'abc')).toBe(true);
    expect(matchGlob('a?c', 'ac')).toBe(false); // needs a character to consume
    expect(matchGlob('a?c', 'abbc')).toBe(false);
    expect(matchGlob('a?', 'a')).toBe(false); // trailing `?` has nothing to match
  });

  test('the empty pattern matches only the empty string', () => {
    expect(matchGlob('', '')).toBe(true);
    expect(matchGlob('', 'x')).toBe(false);
  });
});

describe('matchAnyGlob', () => {
  test('matches when any pattern matches', () => {
    expect(matchAnyGlob(['crm.*', 'dashboards.*'], 'dashboards.sales')).toBe(true);
  });

  test('fails when no pattern matches', () => {
    expect(matchAnyGlob(['crm.*', 'dashboards.*'], 'admin.settings')).toBe(false);
  });

  test('an empty pattern list matches nothing', () => {
    expect(matchAnyGlob([], 'anything')).toBe(false);
  });
});
