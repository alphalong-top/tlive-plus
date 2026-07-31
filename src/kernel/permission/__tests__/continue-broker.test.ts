import { describe, it, expect, vi } from 'vitest';
import { ContinueBroker } from '../continue-broker.js';

describe('ContinueBroker', () => {
  it('fires onRequest with cwd/context and resolves with the reply', async () => {
    const b = new ContinueBroker();
    let captured: { requestId: string; cwd: string; context: string } | null = null;
    b.onRequest((r) => { captured = r; });
    const p = b.request({ cwd: '/r', context: 'done', timeoutSec: 5 });
    expect(captured).not.toBeNull();
    expect(captured!.cwd).toBe('/r');
    expect(captured!.context).toBe('done');
    b.answer(captured!.requestId, 'run tests');
    expect(await p).toBe('run tests');
  });

  it('resolves null on timeout', async () => {
    vi.useFakeTimers();
    const b = new ContinueBroker();
    const p = b.request({ cwd: '/r', context: 'done', timeoutSec: 1 });
    vi.advanceTimersByTime(1100);
    expect(await p).toBeNull();
    vi.useRealTimers();
  });

  it('answer on unknown requestId is a no-op', () => {
    const b = new ContinueBroker();
    expect(() => b.answer('nope', 'x')).not.toThrow();
  });

  it('a newer request cancels the older request for the same session', async () => {
    const b = new ContinueBroker();
    const ids: string[] = [];
    b.onRequest((r) => ids.push(r.requestId));
    const old = b.request({ cwd: '/r', context: 'old', timeoutSec: 5 });
    const current = b.request({ cwd: '/r', context: 'current', timeoutSec: 5 });
    expect(await old).toBeNull();
    expect(b.hasPending('/r')).toBe(true);
    b.answer(ids[1], 'continue');
    expect(await current).toBe('continue');
  });

  it('cancelling one session leaves another session pending', async () => {
    const b = new ContinueBroker();
    const ids = new Map<string, string>();
    b.onRequest((r) => ids.set(r.cwd, r.requestId));
    const cancelled = b.request({ cwd: '/a', context: 'a', timeoutSec: 5 });
    const untouched = b.request({ cwd: '/b', context: 'b', timeoutSec: 5 });
    expect(b.cancel('/a')).toBe(true);
    expect(await cancelled).toBeNull();
    expect(b.hasPending('/a')).toBe(false);
    expect(b.hasPending('/b')).toBe(true);
    b.answer(ids.get('/b')!, 'go');
    expect(await untouched).toBe('go');
  });
});
