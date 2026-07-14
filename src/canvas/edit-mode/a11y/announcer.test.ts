import { afterEach, expect, test } from 'vitest';

import { LiveAnnouncer } from './announcer.js';

const announcers: LiveAnnouncer[] = [];
function make(options?: ConstructorParameters<typeof LiveAnnouncer>[0]): LiveAnnouncer {
  const a = new LiveAnnouncer(options);
  announcers.push(a);
  return a;
}

afterEach(() => {
  while (announcers.length > 0) announcers.pop()!.dispose();
});

test('creates a polite, atomic status live region and appends it to the body by default', () => {
  const a = make();
  const region = a.element;
  expect(region.getAttribute('role')).toBe('status');
  expect(region.getAttribute('aria-live')).toBe('polite');
  expect(region.getAttribute('aria-atomic')).toBe('true');
  expect(region.parentElement).toBe(document.body);
});

test('is visually hidden but stays in the accessibility tree (no display:none / aria-hidden)', () => {
  const region = make().element;
  const style = region.getAttribute('style') ?? '';
  expect(style).not.toMatch(/display\s*:\s*none/);
  expect(style).not.toMatch(/visibility\s*:\s*hidden/);
  expect(region.getAttribute('aria-hidden')).toBeNull();
  expect(style).toMatch(/position\s*:\s*absolute/);
});

test('announce sets the region text, and reflects the last message', () => {
  const a = make();
  a.announce('Moved to column 2, row 1.');
  expect(a.element.textContent).toBe('Moved to column 2, row 1.');
  expect(a.message).toBe('Moved to column 2, row 1.');
  a.announce('Resized to 4 columns wide, 2 rows tall.');
  expect(a.message).toBe('Resized to 4 columns wide, 2 rows tall.');
});

test('honours a custom container and politeness, and dispose removes the region', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const a = make({ container, politeness: 'assertive' });
  expect(a.element.parentElement).toBe(container);
  expect(a.element.getAttribute('aria-live')).toBe('assertive');
  a.dispose();
  expect(a.element.parentElement).toBeNull();
  container.remove();
});
