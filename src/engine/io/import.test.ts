import type { LayoutPage } from '@gridmason/protocol';
import { describe, expect, test } from 'vitest';

import { importLayout } from './import.js';

const validDoc: LayoutPage = {
  schemaVersion: 1,
  page: 'crm.customer-detail',
  name: 'Customer overview',
  default: true,
  hasTabs: false,
  grid: { items: [{ widgetID: { source: 'local', tag: 'gm-chart' }, i: 'a', x: 0, y: 0, w: 3, h: 2 }] },
  tabs: [],
};

describe('importLayout', () => {
  test('parses and validates well-formed JSON into the typed document', () => {
    const result = importLayout(JSON.stringify(validDoc));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(validDoc);
  });

  test('rejects malformed JSON with a generic message that echoes no input', () => {
    // The offending text embeds a would-be secret tag; the fault must not quote it.
    const result = importLayout('{ "schemaVersion": 1, "tag": "gm-secret-capability", ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({ code: 'invalid-json', message: 'input is not valid JSON', path: '' });
      expect(JSON.stringify(result.error)).not.toContain('gm-secret-capability');
    }
  });

  test('rejects valid JSON that is not a valid layout, surfacing the structural fault', () => {
    const badDoc = { ...validDoc, schemaVersion: 0 };
    const result = importLayout(JSON.stringify(badDoc));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: 'bad-schema-version', path: 'schemaVersion' });
  });

  test('rejects valid JSON that is not an object at all', () => {
    const result = importLayout('42');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatchObject({ code: 'not-an-object', path: '' });
  });
});
