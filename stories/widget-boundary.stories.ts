/**
 * Storybook stories for the per-widget error boundary + skeletons (#20, SPEC §7,
 * FR-10) — the crashing / slow / unavailable widget states, rendered through a
 * live `<gm-page-canvas>` (GW-D20 — no story, no merge).
 *
 * Uses the shared demo widgets (`./support.ts`): a healthy, a slow (skeleton), a
 * crashing (fallback card), and a never-defined tag (anonymous unavailable card),
 * so the boundary's fallback card, skeleton, and telemetry attribution are all
 * visible. Framework-agnostic CSF; the stubbed Storybook harness renders it
 * unchanged when the real config lands.
 */
import type { LayoutWidget } from '@gridmason/protocol';

import {
  buildCanvas,
  CRASH_TAG,
  MISSING_TAG,
  OK_TAG,
  singleLayout,
  SLOW_TAG,
  widget,
} from './support.js';
import type { WidgetBoundaryEvent, WidgetInstanceIdentity } from '../src/canvas/boundary/index.js';

/** Friendly names for the entitled demo widgets; an unknown tag stays anonymous (SPEC §6/§8). */
const NAMES: Record<string, string> = {
  [OK_TAG]: 'Overview',
  [SLOW_TAG]: 'Live Feed',
  [CRASH_TAG]: 'Revenue Chart',
};

function build(items: LayoutWidget[]): HTMLElement {
  return buildCanvas((canvas) => {
    canvas.telemetry = (event: WidgetBoundaryEvent) => console.log('[gm telemetry]', event);
    canvas.widgetDescriptor = ({ widgetID }: WidgetInstanceIdentity) => NAMES[widgetID.tag];
    canvas.latencyBudgetMs = 4000;
    canvas.layout = singleLayout(items);
  });
}

const meta = {
  title: 'Canvas/WidgetBoundary',
  render: () =>
    build([
      widget('overview', OK_TAG, { x: 0, w: 4 }),
      widget('feed', SLOW_TAG, { x: 4, w: 4 }),
      widget('revenue', CRASH_TAG, { x: 8, w: 4 }),
    ]),
};
export default meta;

/** A grid mixing a healthy, a slow (skeleton), and a crashing (fallback card) widget. */
export const Mixed = {};

/** A crashing widget renders a named fallback card with a retry, next to a healthy sibling. */
export const CrashingWidget = {
  render: () => build([widget('revenue', CRASH_TAG, { x: 0, w: 6 }), widget('overview', OK_TAG, { x: 6, w: 6 })]),
};

/** A slow widget shows a loading skeleton until it becomes interactive (1.5s). */
export const SlowWidget = {
  render: () => build([widget('feed', SLOW_TAG, { x: 0, w: 6 })]),
};

/** An unresolved (never-defined) tag falls back to an anonymous "Unavailable widget" card. */
export const UnavailableWidget = {
  render: () => build([widget('mystery', MISSING_TAG, { x: 0, w: 6 })]),
};
