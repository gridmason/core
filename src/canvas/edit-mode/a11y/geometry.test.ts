import { expect, test } from 'vitest';

import {
  DEFAULT_MIN_SIZE,
  arrowDirection,
  clampRect,
  moveRect,
  resizeRect,
  sameRect,
} from './geometry.js';
import type { GridRect } from '../../../engine/placement/index.js';

const BOUNDS = { columns: 12, minW: DEFAULT_MIN_SIZE[0], minH: DEFAULT_MIN_SIZE[1] };
const rect = (x: number, y: number, w: number, h: number): GridRect => ({ x, y, w, h });

test('moveRect steps one cell in each direction', () => {
  const start = rect(4, 4, 3, 2);
  expect(moveRect(start, 'left', BOUNDS)).toMatchObject({ x: 3, y: 4 });
  expect(moveRect(start, 'right', BOUNDS)).toMatchObject({ x: 5, y: 4 });
  expect(moveRect(start, 'up', BOUNDS)).toMatchObject({ x: 4, y: 3 });
  expect(moveRect(start, 'down', BOUNDS)).toMatchObject({ x: 4, y: 5 });
});

test('moveRect clamps at the grid edges (never off-grid)', () => {
  expect(moveRect(rect(0, 0, 3, 2), 'left', BOUNDS)).toMatchObject({ x: 0, y: 0 }); // no move past x=0
  expect(moveRect(rect(0, 0, 3, 2), 'up', BOUNDS)).toMatchObject({ x: 0, y: 0 }); // no move past y=0
  // A 3-wide widget at x=9 fills columns 9..11; a right step would run off the 12-col grid, so it holds.
  expect(moveRect(rect(9, 0, 3, 2), 'right', BOUNDS)).toMatchObject({ x: 9, y: 0 });
});

test('resizeRect grows and shrinks by one cell from the bottom-right', () => {
  const start = rect(2, 2, 3, 2);
  expect(resizeRect(start, 'right', BOUNDS)).toMatchObject({ x: 2, y: 2, w: 4, h: 2 });
  expect(resizeRect(start, 'down', BOUNDS)).toMatchObject({ x: 2, y: 2, w: 3, h: 3 });
  expect(resizeRect(start, 'left', BOUNDS)).toMatchObject({ w: 2, h: 2 });
  expect(resizeRect(start, 'up', BOUNDS)).toMatchObject({ w: 3, h: 1 });
});

test('resizeRect will not shrink below the minimum footprint', () => {
  const min = rect(2, 2, 1, 1);
  expect(resizeRect(min, 'left', BOUNDS)).toMatchObject({ w: 1 });
  expect(resizeRect(min, 'up', BOUNDS)).toMatchObject({ h: 1 });
});

test('resizeRect will not grow wider than the grid, and honours a custom minimum', () => {
  expect(resizeRect(rect(0, 0, 12, 2), 'right', BOUNDS)).toMatchObject({ w: 12 });
  const bounds2 = { columns: 12, minW: 2, minH: 2 };
  expect(resizeRect(rect(2, 2, 2, 2), 'left', bounds2)).toMatchObject({ w: 2 });
  expect(resizeRect(rect(2, 2, 2, 2), 'up', bounds2)).toMatchObject({ h: 2 });
});

test('clampRect pulls an oversized width on-grid by shifting the origin left', () => {
  // width capped at the column count, then x pulled back so x+w fits.
  expect(clampRect(rect(10, 0, 5, 2), BOUNDS)).toMatchObject({ x: 7, w: 5 });
});

test('sameRect detects a no-op step', () => {
  expect(sameRect(rect(1, 1, 2, 2), rect(1, 1, 2, 2))).toBe(true);
  expect(sameRect(rect(1, 1, 2, 2), rect(2, 1, 2, 2))).toBe(false);
});

test('arrowDirection maps arrow keys and ignores others', () => {
  expect(arrowDirection('ArrowLeft')).toBe('left');
  expect(arrowDirection('ArrowRight')).toBe('right');
  expect(arrowDirection('ArrowUp')).toBe('up');
  expect(arrowDirection('ArrowDown')).toBe('down');
  expect(arrowDirection('Enter')).toBeUndefined();
});
