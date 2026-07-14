import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

// FR-16 / SPEC §8 as an executable guard: the IO module is the untrusted-input
// surface (a user-supplied layout), so it must carry none of the forbidden
// primitives — no `new RegExp(userInput)`, no dynamic code, no base64/URL widget
// import path, and no network. This scans the shipped IO sources (comments
// stripped, so the prose *documenting* the ban does not trip the check) and
// fails if any forbidden token appears in actual code.

const ioDir = dirname(fileURLToPath(import.meta.url));

/** Remove block and line comments so only executable code is scanned. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments (incl. JSDoc that names the banned tokens)
    .replace(/\/\/.*$/gm, ''); // line comments
}

/** The shipped IO source files (excludes this and the other test files). */
function ioSources(): { file: string; code: string }[] {
  return readdirSync(ioDir)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => ({ file: name, code: stripComments(readFileSync(join(ioDir, name), 'utf8')) }));
}

// Each forbidden token, with why it is banned (SPEC §8 / FR-16).
const FORBIDDEN: readonly { token: string; why: string }[] = [
  { token: 'new RegExp', why: 'no new RegExp(userInput) — glob matching uses the safe matcher (§8)' },
  { token: 'eval(', why: 'no dynamic code execution (§8)' },
  { token: 'new Function', why: 'no dynamic code execution (§8)' },
  { token: 'import(', why: 'no dynamic/remote module import — core loads nothing (§8)' },
  { token: 'require(', why: 'no dynamic module import (§8)' },
  { token: 'fetch(', why: 'zero network calls (§1, §8)' },
  { token: 'XMLHttpRequest', why: 'zero network calls (§1, §8)' },
  { token: 'WebSocket', why: 'zero network calls (§1, §8)' },
  { token: 'atob(', why: 'no base64 widget import path (§8)' },
  { token: 'btoa(', why: 'no base64 widget import path (§8)' },
];

describe('io module security posture (FR-16, SPEC §8)', () => {
  test('the IO sources contain no forbidden primitives', () => {
    const sources = ioSources();
    // Sanity: the module actually has sources to scan.
    expect(sources.length).toBeGreaterThan(0);

    const offences: string[] = [];
    for (const { file, code } of sources) {
      for (const { token, why } of FORBIDDEN) {
        if (code.includes(token)) offences.push(`${file}: '${token}' — ${why}`);
      }
    }
    expect(offences).toEqual([]);
  });
});
