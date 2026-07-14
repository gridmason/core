/**
 * The edit-mode announcement strings (docs/SPEC.md §7, FR-9). Every keyboard
 * edit operation — entering move-mode, moving, resizing, dropping, cancelling,
 * adding, removing, tab switching — is narrated to assistive tech through an
 * ARIA live region ({@link LiveAnnouncer}). Centralizing the wording as pure
 * functions keeps every message in one place (a host can wrap for i18n) and lets
 * the phrasing be unit-tested without a DOM.
 *
 * Grid coordinates are 0-based internally (gridstack `{x,y}`); announcements
 * report them **1-based** ("column 1, row 1") because that is how a person
 * counts.
 */

/** Entered move-mode on `name`: states the controls so a screen-reader user knows the model. */
export function moveModeEntered(name: string): string {
  return `${name}, move mode. Use the arrow keys to move, hold Shift and press the arrow keys to resize. Press Enter to drop, or Escape to cancel.`;
}

/** A single move step settled at cell `(x, y)` (0-based); reported 1-based. */
export function movedTo(x: number, y: number): string {
  return `Moved to column ${x + 1}, row ${y + 1}.`;
}

/** A single resize step settled at `w × h` cells. */
export function resizedTo(w: number, h: number): string {
  return `Resized to ${w} ${units('column', w)} wide, ${h} ${units('row', h)} tall.`;
}

/** Move-mode dropped: `name` committed at cell `(x, y)` (0-based); reported 1-based. */
export function dropped(name: string, x: number, y: number): string {
  return `${name} dropped at column ${x + 1}, row ${y + 1}.`;
}

/** Move-mode cancelled: `name` restored to where it was before move-mode began. */
export function moveCancelled(name: string): string {
  return `Move cancelled. ${name} returned to its previous position.`;
}

/** A widget named `name` was added to the grid. */
export function widgetAdded(name: string): string {
  return `${name} added.`;
}

/** A widget named `name` was removed from the grid. */
export function widgetRemoved(name: string): string {
  return `${name} removed.`;
}

/** Removal of `name` was refused (a locked slot, or a page that forbids customization). */
export function removeRefused(name: string): string {
  return `${name} cannot be removed.`;
}

/** A move/resize/remove was attempted on `name` while it sits in a locked slot. */
export function lockedRefused(name: string): string {
  return `${name} is locked and cannot be moved, resized, or removed.`;
}

/** The active tab switched to the tab named `name`. */
export function tabSwitched(name: string): string {
  return `Switched to ${name} tab.`;
}

/** A new tab named `name` was added. */
export function tabAdded(name: string): string {
  return `${name} tab added.`;
}

/** Singular/plural the unit noun for a count ("1 column" / "2 columns"). */
function units(noun: string, count: number): string {
  return count === 1 ? noun : `${noun}s`;
}
