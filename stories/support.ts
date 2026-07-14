/**
 * Shared scaffolding for the canvas stories (GW-D20 — one story per component).
 *
 * Not a story file itself (no `*.stories.ts` suffix), so the story-coverage
 * checker and the Storybook indexer both skip it. It exists only to remove the
 * copy-paste every per-component story would otherwise carry: the demo widget
 * custom elements, the `EffectiveLayout` builders, and the canvas factory. The
 * stories stay framework-agnostic CSF; the Storybook toolchain is still stubbed
 * (`.storybook/`) and renders them unchanged when the real config lands.
 */
import type { EffectiveLayout } from '../src/engine/layout/index.js';
import type { LayoutWidget } from '@gridmason/protocol';

import { PageCanvas } from '../src/canvas/PageCanvas/index.js';

/** The healthy general-purpose demo widget (id + settings, edit-mode aware). */
export const DEMO_TAG = 'gm-demo-widget';
/** A widget that renders immediately — no skeleton (the boundary stories' baseline). */
export const OK_TAG = 'gm-demo-ok';
/** A widget that declares itself pending, then becomes interactive after a delay. */
export const SLOW_TAG = 'gm-demo-slow';
/** A widget that throws as it mounts, so the boundary shows its fallback card. */
export const CRASH_TAG = 'gm-demo-crash';
/** A tag deliberately never defined — a load failure that degrades to the anonymous card. */
export const MISSING_TAG = 'gm-demo-missing';

/** Shared pane chrome so every demo widget looks like one family. */
export function paneStyle(bg: string, border: string): string {
  return (
    'display:block;height:100%;box-sizing:border-box;padding:12px;border-radius:8px;' +
    `font-family:system-ui,sans-serif;background:${bg};border:1px solid ${border};`
  );
}

/** A tiny self-describing demo widget: renders its instance id and serialized settings. */
class DemoWidget extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['settings', 'edit-mode'];
  }
  connectedCallback(): void {
    this.#render();
  }
  attributeChangedCallback(): void {
    this.#render();
  }
  #render(): void {
    const editing = this.hasAttribute('edit-mode');
    this.style.cssText = paneStyle(editing ? '#fef3c7' : '#eef2ff', editing ? '#f59e0b' : '#c7d2fe');
    this.innerHTML =
      `<strong>${this.getAttribute('instance-id') ?? '?'}</strong>` +
      `<div style="font-size:12px;opacity:.7">settings ${this.getAttribute('settings') ?? '{}'}</div>` +
      (editing ? '<div style="font-size:11px;color:#b45309">edit mode</div>' : '');
  }
}

/** A healthy widget: renders synchronously, no skeleton. */
class OkDemoWidget extends HTMLElement {
  connectedCallback(): void {
    this.style.cssText = paneStyle('#eef2ff', '#c7d2fe');
    this.innerHTML = `<strong>${this.getAttribute('instance-id') ?? '?'}</strong><div style="font-size:12px;opacity:.7">ready</div>`;
  }
}

/** A slow widget: declares itself pending (skeleton), then becomes interactive after 1.5s. */
class SlowDemoWidget extends HTMLElement {
  connectedCallback(): void {
    this.dispatchEvent(new CustomEvent('gm:loading', { bubbles: true }));
    setTimeout(() => {
      this.style.cssText = paneStyle('#ecfdf5', '#a7f3d0');
      this.innerHTML = `<strong>${this.getAttribute('instance-id') ?? '?'}</strong><div style="font-size:12px;opacity:.7">loaded after 1.5s</div>`;
      this.dispatchEvent(new CustomEvent('gm:ready', { bubbles: true }));
    }, 1500);
  }
}

/** A crashing widget: throws as it mounts, so the boundary shows its fallback card. */
class CrashDemoWidget extends HTMLElement {
  connectedCallback(): void {
    throw new Error('demo widget crashed on mount');
  }
}

/** Register every demo widget (idempotent) and the canvas element. */
export function ensureWidgetsDefined(): void {
  const define = (tag: string, ctor: CustomElementConstructor): void => {
    if (customElements.get(tag) === undefined) customElements.define(tag, ctor);
  };
  define(DEMO_TAG, DemoWidget);
  define(OK_TAG, OkDemoWidget);
  define(SLOW_TAG, SlowDemoWidget);
  define(CRASH_TAG, CrashDemoWidget);
  PageCanvas.define();
}

/** A placed demo widget; defaults to the general demo tag at a 4×3 origin cell. */
export function widget(i: string, tag: string = DEMO_TAG, over: Partial<LayoutWidget> = {}): LayoutWidget {
  return { widgetID: { source: 'local', tag }, i, x: 0, y: 0, w: 4, h: 3, ...over };
}

/** A single-grid effective layout over the given placed widgets. */
export function singleLayout(items: LayoutWidget[], lockedSlots: string[] = []): EffectiveLayout {
  return {
    layout: {
      schemaVersion: 1,
      page: 'demo.page',
      name: 'Demo',
      default: true,
      grid: { items },
      hasTabs: false,
      tabs: [],
    },
    lockedSlots,
  };
}

/** A tabbed effective layout: one grid per named tab. */
export function tabbedLayout(tabs: { name: string; items: LayoutWidget[] }[]): EffectiveLayout {
  return {
    layout: {
      schemaVersion: 1,
      page: 'demo.page',
      name: 'Demo',
      default: true,
      grid: { items: [] },
      hasTabs: true,
      tabs: tabs.map((t) => ({ name: t.name, grid: { items: t.items } })),
    },
    lockedSlots: [],
  };
}

/** Build a mounted canvas with the standard demo record context, then apply `configure`. */
export function buildCanvas(configure: (canvas: PageCanvas) => void): PageCanvas {
  ensureWidgetsDefined();
  const canvas = document.createElement(PageCanvas.tagName) as PageCanvas;
  canvas.context = { record: { recordType: 'customer', id: '42' } };
  configure(canvas);
  return canvas;
}
