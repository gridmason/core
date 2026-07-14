import { expect, test } from 'vitest';

import {
  DEFAULT_GRID_COLUMNS,
  clampFootprint,
  firstFitPosition,
  placeFirstFit,
  rectsOverlap,
  type GridRect,
} from './index.js';

const rect = (x: number, y: number, w: number, h: number): GridRect => ({ x, y, w, h });

// --- rectsOverlap: every axis, both open ends, and edge-adjacency ---------

test('overlapping rectangles are detected', () => {
  expect(rectsOverlap(rect(0, 0, 2, 2), rect(1, 1, 2, 2))).toBe(true);
});

test('a rectangle entirely to the left does not overlap (first check false)', () => {
  expect(rectsOverlap(rect(5, 5, 2, 2), rect(0, 5, 2, 2))).toBe(false);
});

test('a rectangle entirely to the right does not overlap (second check false)', () => {
  expect(rectsOverlap(rect(5, 5, 2, 2), rect(9, 5, 2, 2))).toBe(false);
});

test('a rectangle entirely above does not overlap (third check false)', () => {
  expect(rectsOverlap(rect(0, 0, 2, 2), rect(0, -5, 2, 2))).toBe(false);
});

test('a rectangle entirely below does not overlap (fourth check false)', () => {
  expect(rectsOverlap(rect(0, 0, 2, 2), rect(0, 5, 2, 2))).toBe(false);
});

test('edge-adjacent rectangles do not overlap (half-open intervals)', () => {
  // Flush horizontally: a ends at x=2, b starts at x=2.
  expect(rectsOverlap(rect(0, 0, 2, 2), rect(2, 0, 2, 2))).toBe(false);
  // Flush vertically: a ends at y=2, b starts at y=2.
  expect(rectsOverlap(rect(0, 0, 2, 2), rect(0, 2, 2, 2))).toBe(false);
});

// --- clampFootprint -------------------------------------------------------

test('a footprint wider than the grid is capped to the full width', () => {
  expect(clampFootprint({ w: 20, h: 3 }, 12)).toEqual({ w: 12, h: 3 });
});

test('non-positive dimensions coerce to a 1×1 minimum', () => {
  expect(clampFootprint({ w: 0, h: -4 }, 12)).toEqual({ w: 1, h: 1 });
});

test('fractional dimensions floor to whole cells', () => {
  expect(clampFootprint({ w: 3.9, h: 2.5 }, 12)).toEqual({ w: 3, h: 2 });
});

test('a non-positive column count still yields a valid 1-wide grid', () => {
  expect(clampFootprint({ w: 5, h: 2 }, 0)).toEqual({ w: 1, h: 2 });
});

// --- firstFitPosition -----------------------------------------------------

test('places at the origin on an empty grid', () => {
  expect(firstFitPosition([], { w: 4, h: 3 })).toEqual({ x: 0, y: 0 });
});

test('defaults to the standard column count', () => {
  expect(DEFAULT_GRID_COLUMNS).toBe(12);
  // A 12-wide box on the default grid can only sit at x=0.
  expect(firstFitPosition([rect(0, 0, 12, 1)], { w: 12, h: 1 })).toEqual({ x: 0, y: 1 });
});

test('fills the first left-to-right gap on the top row', () => {
  // Columns 0..3 occupied; a 4-wide box fits starting at column 4.
  expect(firstFitPosition([rect(0, 0, 4, 3)], { w: 4, h: 3 }, 12)).toEqual({ x: 4, y: 0 });
});

test('drops to the next free row when the top row is full', () => {
  // Two 6-wide items fill the 12-column top row; the next item goes to y=3.
  const items = [rect(0, 0, 6, 3), rect(6, 0, 6, 3)];
  expect(firstFitPosition(items, { w: 6, h: 3 }, 12)).toEqual({ x: 0, y: 3 });
});

test('reuses a freed slot before appending below', () => {
  // Left half of the top row is empty (only the right half is taken); a 6-wide
  // item fills the left gap rather than starting a new row.
  expect(firstFitPosition([rect(6, 0, 6, 2)], { w: 6, h: 2 }, 12)).toEqual({ x: 0, y: 0 });
});

test('clamps an oversized footprint before scanning', () => {
  // A 20-wide request is capped to 12 and therefore can only sit at x=0, y=0.
  expect(firstFitPosition([], { w: 20, h: 2 }, 12)).toEqual({ x: 0, y: 0 });
});

// --- placeFirstFit --------------------------------------------------------

test('placeFirstFit returns the position plus the clamped size', () => {
  expect(placeFirstFit([rect(0, 0, 4, 3)], { w: 4, h: 3 }, 12)).toEqual({ x: 4, y: 0, w: 4, h: 3 });
});

test('placeFirstFit clamps the size it reports', () => {
  expect(placeFirstFit([], { w: 99, h: 0 }, 8)).toEqual({ x: 0, y: 0, w: 8, h: 1 });
});
