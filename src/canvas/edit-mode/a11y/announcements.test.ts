import { expect, test } from 'vitest';

import * as say from './announcements.js';

test('move-mode entry states the controls', () => {
  const msg = say.moveModeEntered('Sales Chart');
  expect(msg).toContain('Sales Chart');
  expect(msg).toContain('move mode');
  expect(msg).toMatch(/arrow keys/i);
  expect(msg).toMatch(/Shift/);
  expect(msg).toMatch(/Escape/);
});

test('coordinates are reported 1-based', () => {
  expect(say.movedTo(0, 0)).toBe('Moved to column 1, row 1.');
  expect(say.movedTo(3, 4)).toBe('Moved to column 4, row 5.');
  expect(say.dropped('Widget', 2, 1)).toBe('Widget dropped at column 3, row 2.');
});

test('resize pluralizes the unit nouns', () => {
  expect(say.resizedTo(1, 1)).toBe('Resized to 1 column wide, 1 row tall.');
  expect(say.resizedTo(3, 2)).toBe('Resized to 3 columns wide, 2 rows tall.');
});

test('add / remove / refusal messages name the widget', () => {
  expect(say.widgetAdded('Map')).toBe('Map added.');
  expect(say.widgetRemoved('Map')).toBe('Map removed.');
  expect(say.removeRefused('Map')).toContain('cannot be removed');
  expect(say.lockedRefused('Header')).toContain('locked');
  expect(say.moveCancelled('Map')).toContain('previous position');
});

test('tab messages name the tab', () => {
  expect(say.tabSwitched('Details')).toBe('Switched to Details tab.');
  expect(say.tabAdded('Details')).toBe('Details tab added.');
});
