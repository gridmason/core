import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { BOUNDARY_CLASS } from './styles.js';
import { WidgetBoundaryManager } from './boundary-manager.js';
import type { BoundaryMountInput, WidgetBoundaryConfig } from './widget-boundary.js';
import type { WidgetBoundaryEvent } from './telemetry.js';

// A family of test widgets covering every path a boundary must handle: a
// synchronous widget, async (pending) widgets that signal via event or
// attribute, and widgets that fail by throwing (constructor / connectedCallback),
// by reporting a synchronous window error (how a real browser surfaces a
// connectedCallback throw), and a flaky widget that fails once then succeeds.

/** Toggles whether `bt-flaky` throws on its next connect — for the retry test. */
let flakyShouldThrow = true;

class OkWidget extends HTMLElement {
  connectedCallback(): void {
    this.textContent = 'ok';
  }
}
class LoadingEventWidget extends HTMLElement {
  connectedCallback(): void {
    this.dispatchEvent(new CustomEvent('gm:loading', { bubbles: true }));
  }
}
class LoadingAttrWidget extends HTMLElement {
  connectedCallback(): void {
    this.setAttribute('gm-loading', '');
  }
}
class ThrowConnectWidget extends HTMLElement {
  connectedCallback(): void {
    throw new Error('connect-boom');
  }
}
class ThrowCtorWidget extends HTMLElement {
  constructor() {
    super();
    throw new Error('ctor-boom');
  }
}
class WindowErrorWidget extends HTMLElement {
  connectedCallback(): void {
    // Simulate how a real browser surfaces a connectedCallback throw: it is
    // reported to the window `error` event synchronously, not propagated.
    window.dispatchEvent(new ErrorEvent('error', { message: 'reported-boom' }));
  }
}
class FlakyWidget extends HTMLElement {
  connectedCallback(): void {
    if (flakyShouldThrow) throw new Error('flaky-boom');
    this.textContent = 'recovered';
  }
}

customElements.define('bt-ok', OkWidget);
customElements.define('bt-loading-event', LoadingEventWidget);
customElements.define('bt-loading-attr', LoadingAttrWidget);
customElements.define('bt-throw-connect', ThrowConnectWidget);
customElements.define('bt-throw-ctor', ThrowCtorWidget);
customElements.define('bt-window-error', WindowErrorWidget);
customElements.define('bt-flaky', FlakyWidget);

const events: WidgetBoundaryEvent[] = [];
const announced: string[] = [];
let clock = 0;

function makeManager(config: WidgetBoundaryConfig = {}): WidgetBoundaryManager {
  return new WidgetBoundaryManager({
    config: { telemetry: (e) => events.push(e), ...config },
    now: () => clock,
  });
}

function makeHost(): HTMLElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  return host;
}

function input(tag: string, i: string, over: Partial<BoundaryMountInput> = {}): BoundaryMountInput {
  return {
    tag,
    widgetID: { source: 'local', tag },
    instanceId: i,
    sdk: undefined,
    context: undefined,
    settings: undefined,
    editMode: false,
    ...over,
  };
}

beforeEach(() => {
  document.body.innerHTML = '';
  events.length = 0;
  announced.length = 0;
  clock = 0;
  flakyShouldThrow = true;
});

/** A manager with an announce sink wired to {@link announced} (plus the default telemetry). */
function makeAnnouncingManager(config: WidgetBoundaryConfig = {}): WidgetBoundaryManager {
  return makeManager({ announce: (m) => announced.push(m), ...config });
}

afterEach(() => {
  vi.useRealTimers();
});

test('a synchronous widget mounts ready with no skeleton and reports settled latency', () => {
  const mgr = makeManager();
  clock = 5;
  const b = mgr.mount(makeHost(), input('bt-ok', 'w1'));

  expect(b.state).toBe('ready');
  expect(b.root.dataset.gmState).toBe('ready');
  expect(mgr.widgetElement('w1')?.textContent).toBe('ok');
  expect(b.root.querySelector(`.${BOUNDARY_CLASS.fallback}`)).toBeNull();
  const latency = events.find((e) => e.type === 'widget.latency');
  expect(latency).toMatchObject({ type: 'widget.latency', phase: 'settled', exceeded: false, instanceId: 'w1' });
});

test('a widget that signals gm:loading shows a skeleton, then reveals on gm:ready', () => {
  const mgr = makeManager();
  const b = mgr.mount(makeHost(), input('bt-loading-event', 'w1'));

  expect(b.state).toBe('loading');
  expect(b.root.dataset.gmState).toBe('loading');
  const status = b.root.querySelector('[role="status"]');
  expect(status?.textContent).toContain('Loading');
  // No latency settled yet — the widget is still pending.
  expect(events.some((e) => e.type === 'widget.latency')).toBe(false);

  clock = 42;
  mgr.widgetElement('w1')!.dispatchEvent(new CustomEvent('gm:ready', { bubbles: true }));

  expect(b.state).toBe('ready');
  expect(events).toContainEqual(
    expect.objectContaining({ type: 'widget.latency', phase: 'settled', elapsedMs: 42, exceeded: false }),
  );
});

test('the gm-loading attribute is an alternative pending signal', () => {
  const mgr = makeManager();
  const b = mgr.mount(makeHost(), input('bt-loading-attr', 'w1'));
  expect(b.state).toBe('loading');
});

test('a widget that throws in connectedCallback falls back to a named card with a retry', () => {
  const mgr = makeManager({ describe: () => 'Sales Chart' });
  const b = mgr.mount(makeHost(), input('bt-throw-connect', 'w1'));

  expect(b.state).toBe('error');
  expect(mgr.widgetElement('w1')).toBeUndefined();
  const card = b.root.querySelector(`.${BOUNDARY_CLASS.fallback}`)!;
  expect(card.querySelector(`.${BOUNDARY_CLASS.fallbackTitle}`)?.textContent).toBe('Sales Chart');
  expect(card.querySelector('button')?.textContent).toBe('Retry');
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'widget.error',
      reason: 'threw',
      message: 'connect-boom',
      instanceId: 'w1',
      widgetID: { source: 'local', tag: 'bt-throw-connect' },
    }),
  );
});

test('a widget that throws in its constructor falls back', () => {
  const mgr = makeManager();
  const b = mgr.mount(makeHost(), input('bt-throw-ctor', 'w1'));
  expect(b.state).toBe('error');
  expect(events).toContainEqual(expect.objectContaining({ type: 'widget.error', reason: 'threw' }));
});

test('a connectedCallback failure reported to the window error event is caught (browser path)', () => {
  const mgr = makeManager();
  const b = mgr.mount(makeHost(), input('bt-window-error', 'w1'));
  expect(b.state).toBe('error');
  expect(events).toContainEqual(
    expect.objectContaining({ type: 'widget.error', reason: 'threw', message: 'reported-boom' }),
  );
});

test('one widget failing does not affect its siblings', () => {
  const mgr = makeManager();
  const host = makeHost();
  const bad = mgr.mount(host, input('bt-throw-connect', 'bad'));
  const good = mgr.mount(host, input('bt-ok', 'good'));

  expect(bad.state).toBe('error');
  expect(good.state).toBe('ready');
  expect(mgr.widgetElement('good')?.textContent).toBe('ok');
});

test('an unresolved (undefined) tag is an anonymous unavailable card — no tag/name echo', () => {
  const mgr = makeManager();
  const b = mgr.mount(makeHost(), input('bt-not-defined', 'w1'));

  expect(b.state).toBe('error');
  const title = b.root.querySelector(`.${BOUNDARY_CLASS.fallbackTitle}`)!;
  expect(title.textContent).toBe('Unavailable widget');
  // The card must not leak the tag name anywhere in its text (SPEC §6/§8).
  expect(b.root.textContent).not.toContain('bt-not-defined');
  // Telemetry (host-internal, not user-facing) still carries the full identity.
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'widget.error',
      reason: 'unresolved',
      widgetID: { source: 'local', tag: 'bt-not-defined' },
    }),
  );
});

test('an unresolved tag is named when the host descriptor entitles it', () => {
  const mgr = makeManager({ describe: () => 'Known Widget' });
  const b = mgr.mount(makeHost(), input('bt-not-defined', 'w1'));
  expect(b.root.querySelector(`.${BOUNDARY_CLASS.fallbackTitle}`)?.textContent).toBe('Known Widget');
});

test('a widget that dispatches gm:error falls back with reason "reported"', () => {
  const mgr = makeManager();
  const b = mgr.mount(makeHost(), input('bt-ok', 'w1'));
  expect(b.state).toBe('ready');

  mgr.widgetElement('w1')!.dispatchEvent(
    new CustomEvent('gm:error', { bubbles: true, detail: { message: 'runtime-fail' } }),
  );

  expect(b.state).toBe('error');
  expect(events).toContainEqual(
    expect.objectContaining({ type: 'widget.error', reason: 'reported', message: 'runtime-fail' }),
  );
});

test('retry re-runs the mount lifecycle cleanly and recovers a now-healthy widget', () => {
  const mgr = makeManager();
  const b = mgr.mount(makeHost(), input('bt-flaky', 'w1'));
  expect(b.state).toBe('error');

  flakyShouldThrow = false;
  const retry = b.root.querySelector<HTMLButtonElement>(`.${BOUNDARY_CLASS.retry}`)!;
  retry.click();

  expect(b.state).toBe('ready');
  expect(mgr.widgetElement('w1')?.textContent).toBe('recovered');
  expect(b.root.querySelector(`.${BOUNDARY_CLASS.fallback}`)).toBeNull();
});

test('a pending widget that exceeds its latency budget reports an exceeded event', () => {
  vi.useFakeTimers();
  const mgr = makeManager({ latencyBudgetMs: 100 });
  const b = mgr.mount(makeHost(), input('bt-loading-event', 'w1'));
  expect(b.state).toBe('loading');

  vi.advanceTimersByTime(100);

  expect(events).toContainEqual(
    expect.objectContaining({ type: 'widget.latency', phase: 'exceeded', budgetMs: 100, exceeded: true }),
  );
  // Without auto-degrade the widget stays pending for the host to act on.
  expect(b.state).toBe('loading');
});

test('auto-degrade flips a budget-exceeded widget to its fallback card', () => {
  vi.useFakeTimers();
  const mgr = makeManager({ latencyBudgetMs: 100, autoDegradeOnLatency: true, describe: () => 'Slow One' });
  const b = mgr.mount(makeHost(), input('bt-loading-event', 'w1'));

  vi.advanceTimersByTime(100);

  expect(b.state).toBe('error');
  expect(b.root.querySelector(`.${BOUNDARY_CLASS.fallbackTitle}`)?.textContent).toBe('Slow One');
  expect(events).toContainEqual(expect.objectContaining({ type: 'widget.error', reason: 'timeout' }));
});

test('a widget that becomes ready before the budget fires no exceeded event', () => {
  vi.useFakeTimers();
  const mgr = makeManager({ latencyBudgetMs: 100 });
  const b = mgr.mount(makeHost(), input('bt-loading-event', 'w1'));
  mgr.widgetElement('w1')!.dispatchEvent(new CustomEvent('gm:ready', { bubbles: true }));
  vi.advanceTimersByTime(200);

  expect(b.state).toBe('ready');
  expect(events.some((e) => e.type === 'widget.latency' && e.phase === 'exceeded')).toBe(false);
});

test('updateAbiState updates the live widget and reassignSdk swaps the handle', () => {
  const mgr = makeManager();
  mgr.mount(makeHost(), input('bt-ok', 'w1'));
  const el = mgr.widgetElement('w1')!;

  mgr.updateAbiState('w1', { context: { a: 1 }, settings: { b: 2 }, editMode: true });
  expect(el.getAttribute('context')).toBe('{"a":1}');
  expect(el.getAttribute('settings')).toBe('{"b":2}');
  expect(el.hasAttribute('edit-mode')).toBe(true);

  const handle = { bus: 'x' };
  mgr.reassignSdk(handle);
  expect((el as unknown as { sdk?: unknown }).sdk).toBe(handle);
});

test('a retry re-mounts with the latest ABI state set while the widget was errored', () => {
  const mgr = makeManager();
  const b = mgr.mount(makeHost(), input('bt-flaky', 'w1', { context: { v: 1 } }));
  expect(b.state).toBe('error');

  // Context changes while the widget sits in its error state.
  mgr.updateAbiState('w1', { context: { v: 2 }, settings: undefined, editMode: false });
  flakyShouldThrow = false;
  b.root.querySelector<HTMLButtonElement>(`.${BOUNDARY_CLASS.retry}`)!.click();

  expect(mgr.widgetElement('w1')?.getAttribute('context')).toBe('{"v":2}');
});

test('mount refuses a double-mount for the same instance', () => {
  const mgr = makeManager();
  const host = makeHost();
  mgr.mount(host, input('bt-ok', 'w1'));
  expect(() => mgr.mount(host, input('bt-ok', 'w1'))).toThrow(/already mounted/);
});

test('unmount fires the widget disconnect and removes the boundary container', () => {
  const log: string[] = [];
  class Tracked extends HTMLElement {
    disconnectedCallback(): void {
      log.push('disconnected');
    }
  }
  customElements.define('bt-tracked', Tracked);
  const mgr = makeManager();
  const host = makeHost();
  const b = mgr.mount(host, input('bt-tracked', 'w1'));

  expect(mgr.unmount('w1')).toBe(true);
  expect(log).toEqual(['disconnected']);
  expect(host.contains(b.root)).toBe(false);
  expect(mgr.unmount('w1')).toBe(false);
});

test('the fallback card is an accessible group with an alert message and a real button', () => {
  const mgr = makeManager({ describe: () => 'Chart' });
  const b = mgr.mount(makeHost(), input('bt-throw-connect', 'w1'));
  const card = b.root.querySelector(`.${BOUNDARY_CLASS.fallback}`)!;

  expect(card.getAttribute('role')).toBe('group');
  expect(card.getAttribute('aria-label')).toBe('Chart');
  expect(card.querySelector('[role="alert"]')).not.toBeNull();
  const button = card.querySelector('button')!;
  expect(button.tagName).toBe('BUTTON');
  expect(button.getAttribute('type')).toBe('button');
});

test('configure changes behaviour for subsequent mounts', () => {
  const mgr = makeManager();
  mgr.configure({ describe: () => 'Configured Name' });
  const b = mgr.mount(makeHost(), input('bt-throw-connect', 'w1'));
  expect(b.root.querySelector(`.${BOUNDARY_CLASS.fallbackTitle}`)?.textContent).toBe('Configured Name');
});

// A11y announcements (issue #55, SPEC §7, FR-9/FR-10): the boundary speaks the
// state changes a screen-reader user needs to hear — a widget becoming
// unavailable, an auto-degrade, a post-retry recovery — through an opt-in sink,
// while staying silent on the transitions that would only be chatter.

test('a failed widget announces that it is unavailable, by its resolved name', () => {
  const mgr = makeAnnouncingManager({ describe: () => 'Sales Chart' });
  mgr.mount(makeHost(), input('bt-throw-connect', 'w1'));
  expect(announced).toEqual(['Sales Chart is unavailable.']);
});

test('an unattributable failure announces generically — no tag echoed (SPEC §6/§8)', () => {
  const mgr = makeAnnouncingManager();
  mgr.mount(makeHost(), input('bt-not-defined', 'w1'));
  expect(announced).toEqual(['A widget is unavailable.']);
  expect(announced.join(' ')).not.toContain('bt-not-defined');
});

test('an auto-degrade on latency announces a distinct "took too long" message', () => {
  vi.useFakeTimers();
  const mgr = makeAnnouncingManager({
    latencyBudgetMs: 100,
    autoDegradeOnLatency: true,
    describe: () => 'Live Feed',
  });
  mgr.mount(makeHost(), input('bt-loading-event', 'w1'));
  vi.advanceTimersByTime(100);
  expect(announced).toEqual(['Live Feed took too long to load and is unavailable.']);
});

test('a budget breach without auto-degrade is silent (the widget still shows its skeleton)', () => {
  vi.useFakeTimers();
  const mgr = makeAnnouncingManager({ latencyBudgetMs: 100 });
  const b = mgr.mount(makeHost(), input('bt-loading-event', 'w1'));
  vi.advanceTimersByTime(100);
  expect(b.state).toBe('loading');
  expect(announced).toEqual([]);
});

test('a first, never-failed load is silent — no skeleton→ready chatter', () => {
  const mgr = makeAnnouncingManager();
  // Synchronous ready.
  mgr.mount(makeHost(), input('bt-ok', 'w1'));
  // Pending → ready.
  const slow = mgr.mount(makeHost(), input('bt-loading-event', 'w2'));
  slow.element!.dispatchEvent(new CustomEvent('gm:ready', { bubbles: true }));
  expect(announced).toEqual([]);
});

test('a retry that recovers a failed widget announces the recovery', () => {
  const mgr = makeAnnouncingManager({ describe: () => 'Sales Chart' });
  const b = mgr.mount(makeHost(), input('bt-flaky', 'w1'));
  expect(announced).toEqual(['Sales Chart is unavailable.']);

  flakyShouldThrow = false;
  b.root.querySelector<HTMLButtonElement>(`.${BOUNDARY_CLASS.retry}`)!.click();

  expect(b.state).toBe('ready');
  expect(announced).toEqual(['Sales Chart is unavailable.', 'Sales Chart loaded.']);
});

test('when an announce sink is wired, the card drops its inline role="alert" (no double announcement)', () => {
  const mgr = makeAnnouncingManager({ describe: () => 'Chart' });
  const b = mgr.mount(makeHost(), input('bt-throw-connect', 'w1'));
  const card = b.root.querySelector(`.${BOUNDARY_CLASS.fallback}`)!;
  // The card is still a labelled group with its message and retry — just not a
  // second live region, since the wired announcer speaks the failure.
  expect(card.getAttribute('role')).toBe('group');
  expect(card.querySelector('[role="alert"]')).toBeNull();
  expect(card.querySelector(`.${BOUNDARY_CLASS.fallbackMessage}`)?.textContent).toBe(
    'Chart ran into a problem.',
  );
});

test('with no announce sink the boundary is silent but keeps its inline alert baseline', () => {
  const mgr = makeManager({ describe: () => 'Chart' });
  const b = mgr.mount(makeHost(), input('bt-throw-connect', 'w1'));
  // No throw from the absent sink, and the role="alert" baseline is preserved.
  expect(b.root.querySelector('[role="alert"]')).not.toBeNull();
});
