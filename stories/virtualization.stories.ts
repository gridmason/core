/**
 * Storybook story for offscreen-widget virtualization (#21, SPEC §7, FR-15) —
 * GW-D20, no story, no merge.
 *
 * Builds a live `<gm-page-canvas>` with `virtualize` on over a tall layout of
 * many stacked widgets: the canvas mounts only the items near the viewport and
 * tears them down as they scroll away, so a long page's interactive cost stays
 * bounded by what fits on screen. A live counter (fed by the canvas's
 * mount/unmount events) shows how few of the placed widgets are mounted at once.
 * Shares the demo widget + layout builders with the other canvas stories
 * (`./support.ts`).
 */
import { CANVAS_WIDGET_MOUNTED_EVENT, CANVAS_WIDGET_UNMOUNTED_EVENT } from '../src/canvas/PageCanvas/index.js';
import { buildCanvas, singleLayout, widget } from './support.js';

const TOTAL = 40;

/** A caption + a live "mounted N of TOTAL" counter driven by the canvas mount events. */
function buildVirtualizedDemo(): HTMLElement {
  const root = document.createElement('div');
  root.style.cssText = 'width:900px;';

  const caption = document.createElement('p');
  caption.style.cssText = 'font:13px system-ui,sans-serif;color:#334155;margin:0 0 8px;';
  caption.innerHTML =
    `<strong>Virtualized:</strong> ${TOTAL} widgets are placed, but only those near the viewport are ` +
    'mounted. Scroll the canvas and watch the mounted count stay small.';

  const counter = document.createElement('output');
  counter.style.cssText =
    'display:block;position:sticky;top:0;z-index:1;margin-bottom:8px;padding:6px 10px;background:#ecfeff;' +
    'border:1px solid #a5f3fc;border-radius:6px;font:13px system-ui;color:#0e7490;';

  const canvas = buildCanvas((c) => {
    c.virtualize = true;
    // Each widget one row tall, stacked down the page, so most sit far offscreen.
    c.layout = singleLayout(
      Array.from({ length: TOTAL }, (_, n) => widget(`w${n + 1}`, undefined, { x: 0, y: n * 2, w: 6, h: 2 })),
    );
  });

  const refresh = (): void => {
    counter.textContent = `Mounted ${canvas.mountedInstanceIds.length} of ${TOTAL} widgets`;
  };
  canvas.addEventListener(CANVAS_WIDGET_MOUNTED_EVENT, refresh);
  canvas.addEventListener(CANVAS_WIDGET_UNMOUNTED_EVENT, refresh);
  refresh();

  root.append(caption, counter, canvas);
  return root;
}

const meta = {
  title: 'Canvas/Virtualization',
  render: buildVirtualizedDemo,
};
export default meta;

/** A 40-widget page where only the on-screen widgets are mounted at any moment. */
export const Default = {};
