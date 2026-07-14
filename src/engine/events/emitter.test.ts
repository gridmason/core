import { describe, expect, test, vi } from 'vitest';

import { Emitter } from './emitter.js';

// A small event map exercising two distinct event types with structured payloads.
interface TestEvents {
  ping: { readonly n: number };
  pong: { readonly label: string };
}

describe('Emitter', () => {
  test('delivers an emitted event to a subscriber', () => {
    const emitter = new Emitter<TestEvents>();
    const seen: number[] = [];
    emitter.on('ping', (event) => seen.push(event.n));

    emitter.emit('ping', { n: 1 });
    emitter.emit('ping', { n: 2 });

    expect(seen).toEqual([1, 2]);
  });

  test('emitting a type with no subscribers is a no-op', () => {
    const emitter = new Emitter<TestEvents>();
    // The set-absent branch of emit: must not throw.
    expect(() => emitter.emit('ping', { n: 1 })).not.toThrow();
  });

  test('delivers to multiple subscribers in subscription order', () => {
    const emitter = new Emitter<TestEvents>();
    const order: string[] = [];
    emitter.on('ping', () => order.push('a'));
    emitter.on('ping', () => order.push('b'));

    emitter.emit('ping', { n: 0 });

    expect(order).toEqual(['a', 'b']);
  });

  test('routes each event only to listeners of its own type', () => {
    const emitter = new Emitter<TestEvents>();
    const ping = vi.fn();
    const pong = vi.fn();
    emitter.on('ping', ping);
    emitter.on('pong', pong);

    emitter.emit('ping', { n: 1 });

    expect(ping).toHaveBeenCalledOnce();
    expect(pong).not.toHaveBeenCalled();
  });

  test('the same listener added twice is held once (set semantics)', () => {
    const emitter = new Emitter<TestEvents>();
    const listener = vi.fn();
    emitter.on('ping', listener);
    emitter.on('ping', listener);

    expect(emitter.listenerCount('ping')).toBe(1);
    emitter.emit('ping', { n: 1 });
    expect(listener).toHaveBeenCalledOnce();
  });

  describe('on / unsubscribe', () => {
    test('the returned unsubscribe stops further delivery', () => {
      const emitter = new Emitter<TestEvents>();
      const listener = vi.fn();
      const off = emitter.on('ping', listener);

      emitter.emit('ping', { n: 1 });
      off();
      emitter.emit('ping', { n: 2 });

      expect(listener).toHaveBeenCalledOnce();
      expect(emitter.listenerCount('ping')).toBe(0);
    });

    test('unsubscribe is idempotent', () => {
      const emitter = new Emitter<TestEvents>();
      const off = emitter.on('ping', vi.fn());

      off();
      // Second call hits the empty-set / already-removed path without throwing.
      expect(() => off()).not.toThrow();
      expect(emitter.listenerCount('ping')).toBe(0);
    });

    test('removing one of several listeners leaves the rest subscribed', () => {
      const emitter = new Emitter<TestEvents>();
      const a = vi.fn();
      const b = vi.fn();
      const offA = emitter.on('ping', a);
      emitter.on('ping', b);

      offA();
      emitter.emit('ping', { n: 1 });

      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledOnce();
      // The set still has b, so the key was not pruned.
      expect(emitter.listenerCount('ping')).toBe(1);
    });
  });

  describe('off', () => {
    test('off on a never-subscribed type is a no-op (set-absent branch)', () => {
      const emitter = new Emitter<TestEvents>();
      expect(() => emitter.off('pong', vi.fn())).not.toThrow();
    });

    test('off with a listener that was never added leaves existing listeners intact', () => {
      const emitter = new Emitter<TestEvents>();
      const kept = vi.fn();
      emitter.on('ping', kept);

      emitter.off('ping', vi.fn());
      emitter.emit('ping', { n: 1 });

      expect(kept).toHaveBeenCalledOnce();
      expect(emitter.listenerCount('ping')).toBe(1);
    });
  });

  describe('once', () => {
    test('delivers exactly one event then auto-unsubscribes', () => {
      const emitter = new Emitter<TestEvents>();
      const listener = vi.fn();
      emitter.once('ping', listener);

      emitter.emit('ping', { n: 1 });
      emitter.emit('ping', { n: 2 });

      expect(listener).toHaveBeenCalledOnce();
      expect(listener).toHaveBeenCalledWith({ n: 1 });
      expect(emitter.listenerCount('ping')).toBe(0);
    });

    test('removes itself before running, so a re-entrant emit does not re-invoke it', () => {
      const emitter = new Emitter<TestEvents>();
      const calls: number[] = [];
      emitter.once('ping', (event) => {
        calls.push(event.n);
        // Re-entrant emit from within the once handler must not re-fire it.
        if (event.n === 1) emitter.emit('ping', { n: 2 });
      });

      emitter.emit('ping', { n: 1 });

      expect(calls).toEqual([1]);
    });

    test('the returned unsubscribe cancels a once that never fired', () => {
      const emitter = new Emitter<TestEvents>();
      const listener = vi.fn();
      const off = emitter.once('ping', listener);

      off();
      emitter.emit('ping', { n: 1 });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('emit snapshotting', () => {
    test('a listener subscribed during emit does not receive the in-flight event', () => {
      const emitter = new Emitter<TestEvents>();
      const late = vi.fn();
      emitter.on('ping', () => emitter.on('ping', late));

      emitter.emit('ping', { n: 1 });

      // late was added after the snapshot for this emit was taken.
      expect(late).not.toHaveBeenCalled();
      emitter.emit('ping', { n: 2 });
      expect(late).toHaveBeenCalledOnce();
    });

    test('a listener that unsubscribes a sibling mid-emit still delivers to the snapshot', () => {
      const emitter = new Emitter<TestEvents>();
      const b = vi.fn();
      emitter.on('ping', () => offB());
      const offB = emitter.on('ping', b);

      // b was in the snapshot when emit began, so it still runs this round.
      emitter.emit('ping', { n: 1 });
      expect(b).toHaveBeenCalledOnce();

      // Next round it is gone.
      emitter.emit('ping', { n: 2 });
      expect(b).toHaveBeenCalledOnce();
    });
  });

  describe('listenerCount', () => {
    test('is 0 for a type that was never subscribed', () => {
      const emitter = new Emitter<TestEvents>();
      expect(emitter.listenerCount('ping')).toBe(0);
    });

    test('counts current subscribers', () => {
      const emitter = new Emitter<TestEvents>();
      emitter.on('ping', vi.fn());
      emitter.on('ping', vi.fn());
      expect(emitter.listenerCount('ping')).toBe(2);
    });
  });

  describe('clear', () => {
    test('drops every subscription across all types', () => {
      const emitter = new Emitter<TestEvents>();
      const ping = vi.fn();
      const pong = vi.fn();
      emitter.on('ping', ping);
      emitter.on('pong', pong);

      emitter.clear();
      emitter.emit('ping', { n: 1 });
      emitter.emit('pong', { label: 'x' });

      expect(ping).not.toHaveBeenCalled();
      expect(pong).not.toHaveBeenCalled();
      expect(emitter.listenerCount('ping')).toBe(0);
    });
  });
});
