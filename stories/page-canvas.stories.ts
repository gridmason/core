/**
 * Storybook story for {@link PageCanvas} (GW-D20 — no story, no merge).
 *
 * The first real component story: framework-agnostic CSF that builds a live
 * `<gm-page-canvas>` and mounts demo widgets from an in-memory
 * {@link EffectiveLayout}. The demo widget + layout builders are shared across
 * the canvas stories (see `./support.ts`). When the real Storybook config lands
 * (still stubbed in `.storybook/`), it renders these stories unchanged.
 */
import { buildCanvas, singleLayout, tabbedLayout, widget } from './support.js';

const meta = {
  title: 'Canvas/PageCanvas',
  render: () =>
    buildCanvas((canvas) => {
      canvas.layout = singleLayout([
        widget('summary', undefined, { x: 0, y: 0, w: 6, h: 3, props: { title: 'Summary' } }),
        widget('activity', undefined, { x: 6, y: 0, w: 6, h: 3, props: { title: 'Activity' } }),
      ]);
    }),
};
export default meta;

/** Two widgets mounted side by side from a single-grid layout. */
export const Default = {};

/** The same canvas in edit mode — the mounted widget carries the edit-mode ABI attribute. */
export const EditMode = {
  render: () =>
    buildCanvas((canvas) => {
      canvas.editMode = true;
      canvas.layout = singleLayout([widget('summary', undefined, { w: 6, props: { title: 'Summary' } })]);
    }),
};

/** A tabbed layout: one grid per tab, switched with `canvas.activeTab`. */
export const Tabs = {
  render: () =>
    buildCanvas((canvas) => {
      canvas.layout = tabbedLayout([
        { name: 'Overview', items: [widget('overview', undefined, { w: 6 })] },
        { name: 'Details', items: [widget('details', undefined, { w: 6 })] },
      ]);
    }),
};
