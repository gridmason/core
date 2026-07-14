import type { LayoutPage } from '@gridmason/protocol';
import { describe, expect, test } from 'vitest';

import { exportLayout } from './export.js';
import { importLayout } from './import.js';

const doc: LayoutPage = {
  schemaVersion: 1,
  page: 'crm.customer-detail',
  name: 'Customer overview',
  default: true,
  hasTabs: false,
  grid: {
    items: [
      { widgetID: { source: 'local', tag: 'gm-chart' }, i: 'a', x: 0, y: 0, w: 3, h: 2, props: { color: 'blue' } },
      { widgetID: { source: 'sideload:acme.dev', tag: 'acme-notes' }, i: 'b', x: 3, y: 0, w: 6, h: 4, slot: 'notes' },
    ],
  },
  tabs: [],
};

describe('exportLayout', () => {
  test('produces indented, parseable JSON', () => {
    const json = exportLayout(doc);
    expect(json).toContain('\n');
    expect(JSON.parse(json)).toEqual(doc);
  });

  test('round-trips through importLayout to an equal document', () => {
    const result = importLayout(exportLayout(doc));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(doc);
  });
});
