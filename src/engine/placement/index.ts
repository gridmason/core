/**
 * First-fit auto-placement + collision constraints (docs/SPEC.md §2) over grid
 * geometry `{x,y,w,h}`.
 *
 * The edit-mode add-widget operation (canvas layer, #18) uses first-fit to place
 * a new instance: given the items already on a grid and the new widget's
 * footprint, it finds the top-most then left-most free cell in a `columns`-wide
 * grid where the footprint fits without overlapping an existing item. This is the
 * headless half of "add" — the engine computes the geometry, the canvas mounts
 * the element.
 *
 * Pure and DOM-free (SPEC §2): geometry in, geometry out, no mutation and no I/O.
 * The functions here operate on the placeable slice of a `LayoutWidget`
 * (`{x,y,w,h}`) so they carry no dependency on the layout document shape.
 */

/** A rectangular grid footprint in cell coordinates — the placeable slice of `{x,y,w,h,i}`. */
export interface GridRect {
  /** Column of the top-left cell. */
  readonly x: number;
  /** Row of the top-left cell. */
  readonly y: number;
  /** Width in grid columns. */
  readonly w: number;
  /** Height in grid rows. */
  readonly h: number;
}

/** A widget footprint to place: its width and height in grid cells. */
export interface GridFootprint {
  /** Width in grid columns. */
  readonly w: number;
  /** Height in grid rows. */
  readonly h: number;
}

/** The default gridstack column count when a caller does not pin one (SPEC §3 `maxColumns`). */
export const DEFAULT_GRID_COLUMNS = 12;

/**
 * Whether two grid rectangles overlap in any cell. Edge-adjacent rectangles
 * (one starting exactly where the other ends) do **not** overlap — a half-open
 * interval test on both axes — so first-fit can pack items flush against each
 * other.
 */
export function rectsOverlap(a: GridRect, b: GridRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/**
 * Clamp a footprint to a grid `columns` wide: width into `[1, columns]`, height
 * to at least 1, both floored to whole cells. A footprint wider than the grid is
 * capped to the full width; a non-positive or fractional dimension is coerced to
 * a sane minimum so placement always runs on a valid box. `columns` itself is
 * floored to at least 1.
 */
export function clampFootprint(footprint: GridFootprint, columns: number): GridFootprint {
  const maxW = Math.max(1, Math.floor(columns));
  const w = Math.min(maxW, Math.max(1, Math.floor(footprint.w)));
  const h = Math.max(1, Math.floor(footprint.h));
  return { w, h };
}

/**
 * First-fit position for a footprint on a `columns`-wide grid: the top-most,
 * then left-most `{x,y}` where a `w×h` box fits without overlapping any of
 * `items`. Scans row by row from the top, left to right, so a new widget fills
 * the earliest gap in reading order (SPEC §2). The footprint is clamped to the
 * grid width first ({@link clampFootprint}). Always terminates: below every
 * existing item there is an empty row where any box fits.
 */
export function firstFitPosition(
  items: readonly GridRect[],
  footprint: GridFootprint,
  columns: number = DEFAULT_GRID_COLUMNS,
): { x: number; y: number } {
  const { w, h } = clampFootprint(footprint, columns);
  const maxX = Math.max(1, Math.floor(columns)) - w;
  for (let y = 0; ; y++) {
    for (let x = 0; x <= maxX; x++) {
      const candidate: GridRect = { x, y, w, h };
      if (!items.some((item) => rectsOverlap(candidate, item))) {
        return { x, y };
      }
    }
  }
}

/**
 * Place a new footprint on a grid: its first-fit `{x,y}` combined with the
 * clamped `{w,h}`, ready to become a {@link GridRect} for a new `LayoutWidget`.
 * `columns` defaults to {@link DEFAULT_GRID_COLUMNS} (SPEC §3 `maxColumns`).
 */
export function placeFirstFit(
  items: readonly GridRect[],
  footprint: GridFootprint,
  columns: number = DEFAULT_GRID_COLUMNS,
): GridRect {
  const size = clampFootprint(footprint, columns);
  const position = firstFitPosition(items, size, columns);
  return { ...position, w: size.w, h: size.h };
}
