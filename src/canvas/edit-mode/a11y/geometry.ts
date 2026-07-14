/**
 * Pure grid-geometry math for the keyboard move-mode (docs/SPEC.md §7, FR-9).
 *
 * The keyboard alternative moves and resizes a focused widget one grid cell per
 * arrow press. These transforms compute the resulting `{x,y,w,h}` and clamp it
 * onto the grid — no DOM, no gridstack — so the {@link CanvasKeyboardController}
 * can decide the target placement and hand it to the **same** commit path a
 * pointer drag uses (a {@link CANVAS_GEOMETRY_CHANGE_EVENT}, folded into the
 * layout by the edit-mode controller). Keeping the arithmetic here makes it
 * unit-testable in isolation and keeps the DOM layer mechanical.
 */
import type { GridSize } from '@gridmason/protocol';

import type { GridRect } from '../../../engine/placement/index.js';

/** The four arrow-key directions a move or resize step travels. */
export type MoveDirection = 'left' | 'right' | 'up' | 'down';

/** The grid extents a rect is clamped into: the column count and the minimum widget footprint. */
export interface GridBounds {
  /** Total grid columns; a widget can never extend past the last column. */
  readonly columns: number;
  /** Smallest allowed width in columns (SPEC §4 `size.min`). */
  readonly minW: number;
  /** Smallest allowed height in rows (SPEC §4 `size.min`). */
  readonly minH: number;
}

/** The default minimum widget footprint when a manifest does not pin one. */
export const DEFAULT_MIN_SIZE: GridSize = [1, 1];

/**
 * Clamp a rect onto the grid: width into `[minW, columns]`, height at least
 * `minH`, then the origin so the widget stays on the grid (`x ≥ 0`,
 * `x + w ≤ columns`, `y ≥ 0`). Rows are unbounded below — the grid grows
 * downward. A width that overflows the right edge pulls `x` left to fit rather
 * than clipping the widget off the grid.
 */
export function clampRect(rect: GridRect, bounds: GridBounds): GridRect {
  const w = Math.max(bounds.minW, Math.min(rect.w, bounds.columns));
  const h = Math.max(bounds.minH, rect.h);
  const x = Math.max(0, Math.min(rect.x, bounds.columns - w));
  const y = Math.max(0, rect.y);
  return { x, y, w, h };
}

/** The rect one cell in `direction` from `rect`, clamped onto the grid (width/height unchanged). */
export function moveRect(rect: GridRect, direction: MoveDirection, bounds: GridBounds): GridRect {
  const delta = STEP[direction];
  return clampRect({ ...rect, x: rect.x + delta.x, y: rect.y + delta.y }, bounds);
}

/**
 * The rect resized one cell in `direction`, clamped onto the grid: right/left
 * grow/shrink width, down/up grow/shrink height. The top-left origin is held so
 * the widget resizes from its bottom-right, matching a pointer resize handle.
 */
export function resizeRect(rect: GridRect, direction: MoveDirection, bounds: GridBounds): GridRect {
  const delta = STEP[direction];
  return clampRect({ ...rect, w: rect.w + delta.x, h: rect.h + delta.y }, bounds);
}

/** Whether two rects place a widget identically (a clamped no-op step must not announce or commit). */
export function sameRect(a: GridRect, b: GridRect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

/** Per-direction unit step; `x`/`y` double as the resize width/height delta. */
const STEP: Record<MoveDirection, { readonly x: number; readonly y: number }> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/** Map an `ArrowLeft`/`ArrowRight`/`ArrowUp`/`ArrowDown` `KeyboardEvent.key` to a direction, or `undefined`. */
export function arrowDirection(key: string): MoveDirection | undefined {
  switch (key) {
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    default:
      return undefined;
  }
}
