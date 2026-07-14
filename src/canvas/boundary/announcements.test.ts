import { expect, test } from 'vitest';

import * as say from './announcements.js';

test('a named widget is spoken by its resolved display name', () => {
  expect(say.widgetUnavailable('Sales Chart')).toBe('Sales Chart is unavailable.');
  expect(say.widgetTimedOut('Live Feed')).toBe('Live Feed took too long to load and is unavailable.');
  expect(say.widgetRecovered('Sales Chart')).toBe('Sales Chart loaded.');
});

test('an unattributable widget is generic — never a tag echoed (SPEC §6/§8)', () => {
  expect(say.widgetUnavailable(undefined)).toBe('A widget is unavailable.');
  expect(say.widgetTimedOut(undefined)).toBe('A widget took too long to load and is unavailable.');
  expect(say.widgetRecovered(undefined)).toBe('A widget loaded.');
});
