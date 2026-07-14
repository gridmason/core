import { describe, expect, test, vi } from 'vitest';

import type { CatalogRefusalEvent, TelemetryAdapter, TelemetryEvent } from './telemetry.js';
import { catalogTelemetryFor } from './telemetry.js';

const refusal: CatalogRefusalEvent = {
  type: 'catalog.register.refused',
  reason: 'duplicate-identity',
  attempted: { source: 'local', tag: 'acme-chart' },
};

describe('catalogTelemetryFor', () => {
  test('forwards a catalog refusal into the telemetry adapter', () => {
    const record = vi.fn();
    const adapter: TelemetryAdapter = { record };
    const sink = catalogTelemetryFor(adapter);

    sink(refusal);

    expect(record).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledWith(refusal);
  });
});

describe('TelemetryAdapter', () => {
  test('records every telemetry event variant through one sink', () => {
    const seen: TelemetryEvent[] = [];
    const adapter: TelemetryAdapter = { record: (event) => void seen.push(event) };
    const widgetID = { source: 'local', tag: 'acme-chart' } as const;

    adapter.record({
      type: 'widget.error',
      instanceId: 'w1',
      widgetID,
      reason: 'threw',
      error: new Error('boom'),
    });
    adapter.record({
      type: 'widget.latency',
      instanceId: 'w1',
      widgetID,
      phase: 'settled',
      elapsedMs: 42,
      exceeded: false,
    });
    adapter.record(refusal);

    expect(seen.map((e) => e.type)).toEqual([
      'widget.error',
      'widget.latency',
      'catalog.register.refused',
    ]);
  });
});
