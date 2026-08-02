import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startCompanion, threadKey } from '../companion';

function harness(autoRetry: { enabled?: boolean; delaysSec?: number[]; maxAttempts?: number; delaySec?: number } = { enabled: false }) {
  const calls: any[] = [];
  let events: any; // captured CodexRpcEvents wiring via deps.connect
  const rpc = {
    call: vi.fn(async (method: string, params: any) => {
      calls.push({ method, params });
      if (method === 'thread/loaded/list') return { data: ['t1'] };
      if (method === 'thread/resume') return { thread: { id: params.threadId } };
      return {};
    }),
    notify: vi.fn(),
    close: vi.fn(),
  };
  const router = { requestPermission: vi.fn(async () => ({ decision: 'allow' })), cancel: vi.fn(() => 0) };
  const onMonitor = vi.fn();
  const onResumePrompt = vi.fn();
  const onAutoRetry = vi.fn();
  const comp = startCompanion({
    connect: async (e: any) => { events = e; return rpc as any; },
    permissionRouter: router as any,
    onMonitor,
    onResumePrompt,
    onAutoRetry,
    windowSec: () => 86_400,
    autoRetry: () => autoRetry,
  });
  return { rpc, router, onMonitor, onResumePrompt, onAutoRetry, comp, calls, getEvents: () => events, setEvents: (e: any) => { events = e; } };
}

describe('companion', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('on connect lists and resumes threads', async () => {
    const { calls, comp, onMonitor } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.some((c) => c.method === 'thread/loaded/list')).toBe(true);
    expect(calls.some((c) => c.method === 'thread/resume' && c.params.threadId === 't1')).toBe(true);
    expect(onMonitor).toHaveBeenCalledWith(
      { event: 'session-start', cwd: 'codex:t1', sessionId: 't1' },
      'codex:t1',
    );
    comp.stop();
  });

  it('replays a missed approval when a subscribed thread later starts waiting', async () => {
    let events: any;
    let waiting = false;
    let resumeCount = 0;
    const replayResponses: Array<ReturnType<typeof vi.fn>> = [];
    const rpc = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'thread/loaded/list') return { data: ['t1'] };
        if (method === 'thread/list') return {
          data: [{
            id: 't1', preview: '', cwd: '/repo', createdAt: 1, updatedAt: 1,
            status: { type: 'active', activeFlags: waiting ? ['waitingOnApproval'] : [] },
          }],
        };
        if (method === 'thread/resume') {
          resumeCount++;
          if (waiting) {
            const respond = vi.fn();
            replayResponses.push(respond);
            events.onServerRequest(
              `approval-${resumeCount}`,
              'item/commandExecution/requestApproval',
              { threadId: params.threadId, itemId: 'item-1', command: 'pnpm test', cwd: '/repo' },
              respond,
            );
          }
          return { cwd: '/repo', thread: { id: params.threadId } };
        }
        return {};
      }),
      notify: vi.fn(),
      close: vi.fn(),
    };
    let resolveApproval!: (result: { decision: 'allow' }) => void;
    const router = {
      requestPermission: vi.fn(() => new Promise<{ decision: 'allow' }>((resolve) => { resolveApproval = resolve; })),
      cancel: vi.fn(() => 0),
    };
    const comp = startCompanion({
      connect: async (e: any) => { events = e; return rpc as any; },
      permissionRouter: router as any,
      onMonitor: vi.fn(),
      onResumePrompt: vi.fn(),
      windowSec: () => 86_400,
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(resumeCount).toBe(1);

    waiting = true;
    await vi.advanceTimersByTimeAsync(5000);
    await Promise.resolve();
    expect(resumeCount).toBe(2);
    expect(router.requestPermission).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    await Promise.resolve();
    expect(resumeCount).toBe(3);
    expect(router.requestPermission).toHaveBeenCalledTimes(1);

    resolveApproval({ decision: 'allow' });
    await Promise.resolve();
    await Promise.resolve();
    expect(replayResponses).toHaveLength(2);
    for (const respond of replayResponses) expect(respond).toHaveBeenCalledWith({ decision: 'accept' });
    comp.stop();
  });

  it('resume retries on no-rollout then succeeds', async () => {
    const calls: any[] = [];
    let events: any;
    let resumeAttempts = 0;
    const rpc = {
      call: vi.fn(async (method: string, params: any) => {
        calls.push({ method, params });
        if (method === 'thread/loaded/list') return { data: ['t1'] };
        if (method === 'thread/resume') {
          resumeAttempts++;
          if (resumeAttempts < 3) throw new Error('no rollout found for thread t1');
          return { thread: { id: params.threadId } };
        }
        return {};
      }),
      notify: vi.fn(),
      close: vi.fn(),
    };
    const router = { requestPermission: vi.fn(async () => ({ decision: 'allow' })), cancel: vi.fn(() => 0) };
    const comp = startCompanion({
      connect: async (e: any) => { events = e; return rpc as any; },
      permissionRouter: router as any,
      onMonitor: vi.fn(),
      onResumePrompt: vi.fn(),
      windowSec: () => 86_400,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(resumeAttempts).toBe(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(resumeAttempts).toBe(2);
    await vi.advanceTimersByTimeAsync(3000);
    expect(resumeAttempts).toBe(3);
    comp.stop();
  });

  it('approval ServerRequest -> requestPermission -> accept response', async () => {
    const { comp, router, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    const respond = vi.fn();
    events.onServerRequest(5, 'item/commandExecution/requestApproval', { threadId: 't1', itemId: 'i1', command: 'rm -rf /', cwd: '/w' }, respond);
    await Promise.resolve();
    await Promise.resolve();
    expect(router.requestPermission).toHaveBeenCalledWith(expect.objectContaining({
      // This harness's thread/resume mock never returns a `cwd`, so the
      // session cwd falls back to the thread key (see cwdOf in companion.ts).
      // The payload's own `/w` (command-execution cwd) stays confined to
      // `input.cwd` below — it is never promoted to the session cwd.
      key: 'codex:t1',
      cwd: 'codex:t1',
      toolName: 'Bash',
      timeoutSec: 86_400,
      sessionId: 't1',
      requestKey: 'i1',
      input: expect.objectContaining({ command: 'rm -rf /', cwd: '/w' }),
    }));
    expect(respond).toHaveBeenCalledWith({ decision: 'accept' });
    comp.stop();
  });

  it('deny maps to decline; defer never responds', async () => {
    const { comp, router, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();

    router.requestPermission.mockResolvedValueOnce({ decision: 'deny' });
    const respondDeny = vi.fn();
    events.onServerRequest(6, 'item/commandExecution/requestApproval', { threadId: 't1', itemId: 'i2', command: 'echo hi' }, respondDeny);
    await Promise.resolve();
    await Promise.resolve();
    expect(respondDeny).toHaveBeenCalledWith({ decision: 'decline' });

    router.requestPermission.mockResolvedValueOnce({ decision: 'defer' });
    const respondDefer = vi.fn();
    events.onServerRequest(7, 'item/commandExecution/requestApproval', { threadId: 't1', itemId: 'i3', command: 'echo bye' }, respondDefer);
    await Promise.resolve();
    await Promise.resolve();
    expect(respondDefer).not.toHaveBeenCalled();
    comp.stop();
  });

  it('item/completed(commandExecution) and turn/completed trigger cancel with threadKey', async () => {
    const { comp, router, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();

    events.onNotify('item/completed', { threadId: 't1', item: { type: 'commandExecution' } });
    expect(router.cancel).not.toHaveBeenCalled();

    events.onNotify('item/completed', { threadId: 't1', item: { id: 'i1', type: 'commandExecution' } });
    expect(router.cancel).toHaveBeenCalledWith({ key: 'codex:t1', toolName: 'Bash', sessionId: 't1', requestKey: 'i1' });

    events.onNotify('turn/completed', { threadId: 't1' });
    expect(router.cancel).toHaveBeenCalledWith({ key: 'codex:t1' });
    comp.stop();
  });

  it('reconnects after onClose with backoff and stop() ends the loop', async () => {
    let connectCount = 0;
    let events: any;
    const states: string[] = [];
    const rpc = {
      call: vi.fn(async (method: string) => (method === 'thread/loaded/list' ? { data: [] } : {})),
      notify: vi.fn(),
      close: vi.fn(),
    };
    const router = { requestPermission: vi.fn(async () => ({ decision: 'allow' })), cancel: vi.fn(() => 0) };
    const comp = startCompanion({
      connect: async (e: any) => { connectCount++; events = e; return rpc as any; },
      permissionRouter: router as any,
      onMonitor: vi.fn(),
      onResumePrompt: vi.fn(),
      windowSec: () => 86_400,
      onStateChange: (state) => { states.push(state); },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(connectCount).toBe(1);
    expect(states).toEqual(['running']);

    events.onClose();
    expect(states.at(-1)).toBe('degraded');
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(connectCount).toBe(2);
    expect(states.at(-1)).toBe('running');

    events.onClose();
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    await Promise.resolve();
    expect(connectCount).toBe(3);

    comp.stop();
    events.onClose();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(connectCount).toBe(3);
  });

  it('item/started userMessage -> prompt monitor event', async () => {
    const { comp, onMonitor, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    events.onNotify('item/started', { threadId: 't1', item: { type: 'userMessage', content: [{ text: 'hello' }] } });
    expect(onMonitor).toHaveBeenCalledWith({ event: 'prompt', cwd: 'codex:t1', sessionId: 't1', prompt: 'hello' }, 'codex:t1');
    comp.stop();
  });

  it('item/started commandExecution -> activity monitor event', async () => {
    const { comp, onMonitor, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    events.onNotify('item/started', { threadId: 't1', item: { type: 'commandExecution' } });
    expect(onMonitor).toHaveBeenCalledWith({ event: 'activity', cwd: 'codex:t1', sessionId: 't1', toolName: 'Bash', result: {} }, 'codex:t1');
    comp.stop();
  });

  it('turn/started -> (turn) activity monitor event', async () => {
    const { comp, onMonitor, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    events.onNotify('turn/started', { threadId: 't1' });
    expect(onMonitor).toHaveBeenCalledWith({ event: 'activity', cwd: 'codex:t1', sessionId: 't1', toolName: '(turn)', result: {} }, 'codex:t1');
    comp.stop();
  });

  it('turn/completed -> attention with remembered lastMessage + onResumePrompt', async () => {
    const calls: any[] = [];
    let events: any;
    const rpc = {
      call: vi.fn(async (method: string) => (method === 'thread/loaded/list' ? { data: ['t1'] } : {})),
      notify: vi.fn(),
      close: vi.fn(),
    };
    const router = { requestPermission: vi.fn(async () => ({ decision: 'allow' })), cancel: vi.fn(() => 0) };
    const onMonitor = vi.fn();
    const onResumePrompt = vi.fn();
    const comp = startCompanion({
      connect: async (e: any) => { events = e; return rpc as any; },
      permissionRouter: router as any,
      onMonitor,
      onResumePrompt,
      windowSec: () => 86_400,
    });
    calls.length = 0;
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    events.onNotify('item/completed', { threadId: 't1', item: { type: 'agentMessage', text: 'final answer' } });
    events.onNotify('turn/completed', { threadId: 't1' });

    expect(onMonitor).toHaveBeenCalledWith(
      { event: 'attention', cwd: 'codex:t1', sessionId: 't1', message: 'Turn finished — reply to continue', lastMessage: 'final answer' },
      'codex:t1',
    );
    expect(onResumePrompt).toHaveBeenCalledWith({ threadId: 't1', key: 'codex:t1', lastMessage: 'final answer' });

    // An empty agentMessage must not clobber the real last message — the
    // continue card's excerpt would collapse to a bare "Reply to continue".
    events.onNotify('item/completed', { threadId: 't1', item: { type: 'agentMessage', text: '' } });
    events.onNotify('turn/completed', { threadId: 't1' });
    expect(onResumePrompt).toHaveBeenLastCalledWith({ threadId: 't1', key: 'codex:t1', lastMessage: 'final answer' });
    comp.stop();
  });

  it('waits through retryable errors, then reports the failed turn with the full error', async () => {
    const { comp, onMonitor, onResumePrompt, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    onMonitor.mockClear();
    const events = getEvents();
    const error = {
      message: 'unexpected status 503 Service Unavailable',
      additionalDetails: 'Selected model is at capacity. Please try a different model.',
    };

    events.onNotify('error', { threadId: 't1', turnId: 'turn-1', willRetry: true, error });
    expect(onResumePrompt).not.toHaveBeenCalled();

    events.onNotify('turn/completed', {
      threadId: 't1',
      turn: { id: 'turn-1', status: 'failed', error: null },
    });
    const message = `${error.message}\n${error.additionalDetails}`;
    expect(onMonitor).toHaveBeenCalledWith(
      { event: 'attention', cwd: 'codex:t1', sessionId: 't1', message: `Codex turn failed: ${message}` },
      'codex:t1',
    );
    expect(onResumePrompt).toHaveBeenCalledWith({ threadId: 't1', key: 'codex:t1', error: message });
    comp.stop();
  });

  it('deduplicates final error and turn/completed notifications in either order', async () => {
    const { comp, onResumePrompt, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    const error = { message: 'unexpected status 503 Service Unavailable' };

    events.onNotify('error', { threadId: 't1', turnId: 'turn-1', willRetry: false, error });
    events.onNotify('turn/completed', { threadId: 't1', turn: { id: 'turn-1', status: 'failed', error } });
    expect(onResumePrompt).toHaveBeenCalledTimes(1);

    events.onNotify('turn/completed', { threadId: 't1', turn: { id: 'turn-2', status: 'failed', error } });
    events.onNotify('error', { threadId: 't1', turnId: 'turn-2', willRetry: false, error });
    expect(onResumePrompt).toHaveBeenCalledTimes(2);
    comp.stop();
  });

  it.each([
    'exceeded retry limit, last status: 429 Too Many Requests',
    'unexpected status 502 Bad Gateway',
    'Upstream service temporarily unavailable',
    'unexpected status 503 Service Unavailable',
    'Selected model is at capacity. Please try a different model.',
  ])('retries a terminal provider failure and reports its reason: %s', async (message) => {
    const { comp, getEvents, onResumePrompt, onAutoRetry } = harness({ enabled: true, maxAttempts: 1, delaySec: 10 });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    getEvents().onNotify('error', {
      threadId: 't1', turnId: 'turn-1', willRetry: false, error: { message },
    });
    expect(onResumePrompt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onAutoRetry).toHaveBeenCalledWith({
      threadId: 't1', key: 'codex:t1', prompt: '从中断处继续', error: message, attempt: 1, maxAttempts: 1,
    });
    comp.stop();
  });

  it('retries three times after 1, 3, and 5 minutes, then stops', async () => {
    const { comp, rpc, getEvents, onResumePrompt, onAutoRetry } = harness({ enabled: true, delaysSec: [60, 180, 300] });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    const error = { message: 'unexpected status 503 Service Unavailable' };

    events.onNotify('error', { threadId: 't1', turnId: 'turn-1', willRetry: false, error });
    expect(onResumePrompt).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(59_999);
    expect(rpc.call).not.toHaveBeenCalledWith('turn/start', expect.objectContaining({ input: [{ type: 'text', text: '从中断处继续' }] }));
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(rpc.call).toHaveBeenCalledWith('turn/start', { threadId: 't1', input: [{ type: 'text', text: '从中断处继续' }] });
    expect(onAutoRetry).toHaveBeenLastCalledWith({
      threadId: 't1', key: 'codex:t1', prompt: '从中断处继续', error: error.message, attempt: 1, maxAttempts: 3,
    });

    for (const [attempt, delay] of [
      [2, 180_000], [3, 300_000],
    ] as const) {
      events.onNotify('error', { threadId: 't1', turnId: `turn-${attempt}`, willRetry: false, error });
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(onAutoRetry).toHaveBeenCalledTimes(attempt - 1);
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
      expect(onAutoRetry).toHaveBeenLastCalledWith({
        threadId: 't1', key: 'codex:t1', prompt: '从中断处继续', error: error.message, attempt, maxAttempts: 3,
      });
    }

    events.onNotify('error', { threadId: 't1', turnId: 'turn-4', willRetry: false, error });
    expect(onResumePrompt).toHaveBeenCalledWith({ threadId: 't1', key: 'codex:t1', error: error.message });
    expect(onResumePrompt).toHaveBeenCalledTimes(1);
    expect(rpc.call.mock.calls.filter(([method, params]) =>
      method === 'turn/start' && params.input?.[0]?.text === '从中断处继续')).toHaveLength(3);
    expect(onAutoRetry).toHaveBeenCalledTimes(3);
    comp.stop();
  });

  it('normal agent output, including a partial delta, clears failures and cancels the pending retry', async () => {
    const { comp, rpc, getEvents, onResumePrompt } = harness({ enabled: true, maxAttempts: 5, delaySec: 60 });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    const error = { message: 'Selected model is at capacity. Please try a different model.' };

    events.onNotify('error', { threadId: 't1', turnId: 'turn-1', willRetry: false, error });
    events.onNotify('item/agentMessage/delta', { threadId: 't1', delta: '正常回复了几句' });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(rpc.call).not.toHaveBeenCalledWith('turn/start', expect.objectContaining({ input: [{ type: 'text', text: '从中断处继续' }] }));

    events.onNotify('error', { threadId: 't1', turnId: 'turn-2', willRetry: false, error });
    events.onNotify('item/completed', { threadId: 't1', item: { type: 'agentMessage', text: '再次正常回复' } });
    events.onNotify('error', { threadId: 't1', turnId: 'turn-3', willRetry: false, error });
    expect(onResumePrompt).not.toHaveBeenCalled();
    comp.stop();
  });

  it('interrupting a failed turn cancels its pending automatic retry', async () => {
    const { comp, rpc, getEvents, onAutoRetry } = harness({ enabled: true, delaysSec: [60, 180] });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    const error = { message: 'unexpected status 503 Service Unavailable' };

    events.onNotify('error', { threadId: 't1', turnId: 'turn-1', willRetry: false, error });
    events.onNotify('turn/completed', { threadId: 't1', turn: { id: 'turn-1', status: 'interrupted' } });
    await vi.advanceTimersByTimeAsync(60_000);

    expect(rpc.call).not.toHaveBeenCalledWith('turn/start', expect.objectContaining({
      input: [{ type: 'text', text: '从中断处继续' }],
    }));
    expect(onAutoRetry).not.toHaveBeenCalled();
    comp.stop();
  });

  it('manual resume cancels a pending automatic retry', async () => {
    const { comp, rpc, getEvents, onAutoRetry } = harness({ enabled: true, delaysSec: [60, 180] });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    events.onNotify('error', {
      threadId: 't1', turnId: 'turn-1', willRetry: false,
      error: { message: 'unexpected status 503 Service Unavailable' },
    });

    await comp.resume('t1', '我自己继续');
    await vi.advanceTimersByTimeAsync(60_000);

    expect(rpc.call).toHaveBeenCalledWith('turn/start', {
      threadId: 't1', input: [{ type: 'text', text: '我自己继续' }],
    });
    expect(rpc.call.mock.calls.filter(([method, params]) =>
      method === 'turn/start' && params.input?.[0]?.text === '从中断处继续')).toHaveLength(0);
    expect(onAutoRetry).not.toHaveBeenCalled();
    comp.stop();
  });

  it('thread/archived -> session-end monitor event', async () => {
    // Real archival notification: ThreadArchivedNotification { threadId }
    // (app-server-protocol .../v2/common.rs:1323-1328, camelCase on the wire),
    // delivered as method "thread/archived" (common.rs:1485). This is a
    // *separate* notification from thread/status/changed — see the next test.
    const { comp, onMonitor, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    events.onNotify('thread/archived', { threadId: 't1' });
    expect(onMonitor).toHaveBeenCalledWith({ event: 'session-end', cwd: 'codex:t1', sessionId: 't1' }, 'codex:t1');
    comp.stop();
  });

  it('thread/status/changed (any real ThreadStatus shape) never fires session-end', async () => {
    // ThreadStatus (app-server-protocol .../v2/thread.rs:1131-1144) has exactly
    // four variants — notLoaded / idle / systemError / active — with #[serde(tag
    // = "type")]. There is no `archived` variant, so this notification can never
    // carry archival; session-end must come only from thread/archived (above).
    const { comp, onMonitor, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    events.onNotify('thread/status/changed', { threadId: 't1', status: { type: 'notLoaded' } });
    events.onNotify('thread/status/changed', { threadId: 't1', status: { type: 'idle' } });
    events.onNotify('thread/status/changed', { threadId: 't1', status: { type: 'systemError' } });
    events.onNotify('thread/status/changed', { threadId: 't1', status: { type: 'active', activeFlags: [] } });
    expect(onMonitor).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'session-end' }), expect.anything());
    comp.stop();
  });

  it('resume() calls turn/start with items array', async () => {
    const { comp, calls } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    await comp.resume('t1', 'fix tests');
    expect(calls.some((c) => c.method === 'turn/start' && c.params.threadId === 't1'
      && Array.isArray(c.params.input) && c.params.input[0].text === 'fix tests')).toBe(true);
    comp.stop();
  });

  it('listThreads maps thread/list pagination and drops malformed entries', async () => {
    const { comp, rpc } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    rpc.call.mockImplementation(async (method: string) => method === 'thread/list' ? {
      data: [
        {
          id: 'history-1', preview: 'fix checkout', cwd: '/repo', createdAt: 10, updatedAt: 20,
          recencyAt: 30, name: 'Checkout', status: { type: 'notLoaded' },
        },
        { id: '', status: { type: 'idle' } },
        { id: 'bad-status', status: { type: 'archived' } },
      ],
      nextCursor: 'next-1',
    } : {});

    await expect(comp.listThreads({ limit: 6, archived: false, searchTerm: 'checkout' })).resolves.toEqual({
      threads: [{
        id: 'history-1', preview: 'fix checkout', cwd: '/repo', createdAt: 10, updatedAt: 20,
        recencyAt: 30, name: 'Checkout', status: { type: 'notLoaded' },
      }],
      nextCursor: 'next-1',
    });
    expect(rpc.call).toHaveBeenCalledWith('thread/list', {
      limit: 6,
      archived: false,
      sortKey: 'recency_at',
      sortDirection: 'desc',
      searchTerm: 'checkout',
    }, 30_000);
    comp.stop();
  });

  it('unarchiveThread delegates to thread/unarchive', async () => {
    const { comp, rpc } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    await comp.unarchiveThread('old-thread');
    expect(rpc.call).toHaveBeenCalledWith('thread/unarchive', { threadId: 'old-thread' });
    comp.stop();
  });

  it('resume() steers the active turn instead of starting a conflicting turn', async () => {
    const { comp, rpc } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    rpc.call.mockImplementation(async (method: string, params: any) => {
      if (method === 'thread/resume') {
        return { thread: { id: params.threadId, turns: [{ id: 'turn-active', status: 'inProgress' }] }, cwd: '/repo' };
      }
      return {};
    });
    await comp.resume('t1', 'focus on the failing test');
    expect(rpc.call).toHaveBeenCalledWith('turn/steer', {
      threadId: 't1',
      input: [{ type: 'text', text: 'focus on the failing test' }],
      expectedTurnId: 'turn-active',
    });
    comp.stop();
  });

  it('resume() throws when not connected', async () => {
    const { comp, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    getEvents().onClose();
    await expect(comp.resume('t1', 'x')).rejects.toThrow();
    comp.stop();
  });

  it('polls thread/loaded/list periodically and resumes newly appearing threads', async () => {
    let listResult: { data: string[] } = { data: [] };
    const calls: any[] = [];
    let events: any;
    const rpc = {
      call: vi.fn(async (method: string, params: any) => {
        calls.push({ method, params });
        if (method === 'thread/loaded/list') return listResult;
        if (method === 'thread/resume') return { thread: { id: params.threadId } };
        return {};
      }),
      notify: vi.fn(),
      close: vi.fn(),
    };
    const router = { requestPermission: vi.fn(async () => ({ decision: 'allow' })), cancel: vi.fn(() => 0) };
    const comp = startCompanion({
      connect: async (e: any) => { events = e; return rpc as any; },
      permissionRouter: router as any,
      onMonitor: vi.fn(),
      onResumePrompt: vi.fn(),
      windowSec: () => 86_400,
    });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.filter((c) => c.method === 'thread/resume').length).toBe(0);

    listResult = { data: ['t9'] };
    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.filter((c) => c.method === 'thread/resume' && c.params.threadId === 't9').length).toBe(1);

    await vi.advanceTimersByTimeAsync(5_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls.filter((c) => c.method === 'thread/resume' && c.params.threadId === 't9').length).toBe(1);

    comp.stop();
  });

  it('clears resumed set and polling on close; re-resumes after reconnect', async () => {
    let connectCount = 0;
    let events: any;
    const rpc = {
      call: vi.fn(async (method: string) => (method === 'thread/loaded/list' ? { data: ['t1'] } : {})),
      notify: vi.fn(),
      close: vi.fn(),
    };
    const router = { requestPermission: vi.fn(async () => ({ decision: 'allow' })), cancel: vi.fn(() => 0) };
    const comp = startCompanion({
      connect: async (e: any) => { connectCount++; events = e; return rpc as any; },
      permissionRouter: router as any,
      onMonitor: vi.fn(),
      onResumePrompt: vi.fn(),
      windowSec: () => 86_400,
    });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    expect(connectCount).toBe(1);
    expect(rpc.call.mock.calls.filter((c) => c[0] === 'thread/resume' && c[1].threadId === 't1').length).toBe(1);

    events.onClose();
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();
    await Promise.resolve();
    expect(connectCount).toBe(2);
    expect(rpc.call.mock.calls.filter((c) => c[0] === 'thread/resume' && c[1].threadId === 't1').length).toBe(2);

    comp.stop();
  });

  it('threadKey formats id', () => {
    expect(threadKey('abc')).toBe('codex:abc');
  });

  it('requestPermission rejection does not crash; logs, never responds, leaves pending', async () => {
    const { comp, router, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();

    const rejectionError = new Error('approval request failed');
    router.requestPermission.mockRejectedValueOnce(rejectionError);
    const respond = vi.fn();
    events.onServerRequest(8, 'item/commandExecution/requestApproval', { threadId: 't1', itemId: 'i4', command: 'dangerous cmd' }, respond);

    // Drain microtasks and wait a tick
    await Promise.resolve();
    await Promise.resolve();

    // respond should never be called (approval stays pending)
    expect(respond).not.toHaveBeenCalled();

    comp.stop();
  });

  it('a thread whose resume retries exhaust is retried again on a later poll', async () => {
    const calls: any[] = [];
    let events: any;
    let resumeAttempts = 0;
    let shouldSucceed = false;
    const rpc = {
      call: vi.fn(async (method: string, params: any) => {
        calls.push({ method, params });
        if (method === 'thread/loaded/list') return { data: ['t2'] };
        if (method === 'thread/resume') {
          resumeAttempts++;
          // Fail with 'no rollout' for first 10 attempts (RESUME_RETRY_MAX),
          // then succeed on attempt 11 (after poll triggers fresh retry)
          if (!shouldSucceed) throw new Error('no rollout found for thread t2');
          return { thread: { id: params.threadId } };
        }
        return {};
      }),
      notify: vi.fn(),
      close: vi.fn(),
    };
    const router = { requestPermission: vi.fn(async () => ({ decision: 'allow' })), cancel: vi.fn(() => 0) };
    const comp = startCompanion({
      connect: async (e: any) => { events = e; return rpc as any; },
      permissionRouter: router as any,
      onMonitor: vi.fn(),
      onResumePrompt: vi.fn(),
      windowSec: () => 86_400,
    });
    await Promise.resolve();
    await Promise.resolve();

    // Initial connect + poll should trigger first resume attempt
    expect(resumeAttempts).toBe(1);

    // Exhaust all RESUME_RETRY_MAX (10) retries: each at 3000ms intervals
    // Attempts 2-10 (9 retries after initial)
    for (let i = 0; i < 9; i++) {
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(resumeAttempts).toBe(10);

    // Now allow resume to succeed
    shouldSucceed = true;

    // Advance to the next poll cycle (polls run every 5s; retries ended at 27s, next poll at 30s)
    // This poll will call resumeThread again since we deleted from resumed set on final failure
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.resolve();
    await Promise.resolve();
    // At time 30s, poll should trigger and make attempt 11
    expect(resumeAttempts).toBe(11);

    comp.stop();
  });

  it('reports the real cwd (from thread/resume) so the session label becomes the project name', async () => {
    let events: any;
    const rpc = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'thread/loaded/list') return { data: ['t1'] };
        if (method === 'thread/resume') return { thread: { id: params.threadId }, cwd: '/home/y/Project/mihomo-gui' };
        return {};
      }),
      notify: vi.fn(),
      close: vi.fn(),
    };
    const router = { requestPermission: vi.fn(async () => ({ decision: 'allow' })), cancel: vi.fn(() => 0) };
    const onMonitor = vi.fn();
    const comp = startCompanion({
      connect: async (e: any) => { events = e; return rpc as any; },
      permissionRouter: router as any,
      onMonitor,
      onResumePrompt: vi.fn(),
      windowSec: () => 86_400,
    });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    events.onNotify('item/started', { threadId: 't1', item: { type: 'userMessage', content: [{ text: 'hi' }] } });
    // key stays the unique thread id; cwd becomes the real directory so
    // registry's label = basename(cwd) = "mihomo-gui" instead of "codex:t1".
    expect(onMonitor).toHaveBeenCalledWith(
      { event: 'prompt', cwd: '/home/y/Project/mihomo-gui', sessionId: 't1', prompt: 'hi' },
      'codex:t1',
    );
    comp.stop();
  });

  it('falls back to the thread key when resume yields no cwd (never crashes)', async () => {
    // harness()'s thread/resume mock returns no `cwd` — this documents the
    // fallback explicitly, as the safety net for Step 3's cwdOf().
    const { comp, onMonitor, getEvents } = harness();
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();
    const events = getEvents();
    events.onNotify('item/started', { threadId: 't1', item: { type: 'userMessage', content: [{ text: 'hi' }] } });
    expect(onMonitor).toHaveBeenCalledWith(
      { event: 'prompt', cwd: 'codex:t1', sessionId: 't1', prompt: 'hi' },
      'codex:t1',
    );
    comp.stop();
  });

  it('requestPermission gets the real session cwd while input.cwd keeps the command-execution cwd and key stays codex:<id>', async () => {
    let events: any;
    const rpc = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'thread/loaded/list') return { data: ['t1'] };
        if (method === 'thread/resume') return { thread: { id: params.threadId }, cwd: '/home/y/Project/mihomo-gui' };
        return {};
      }),
      notify: vi.fn(),
      close: vi.fn(),
    };
    const router = { requestPermission: vi.fn(async () => ({ decision: 'allow' })), cancel: vi.fn(() => 0) };
    const comp = startCompanion({
      connect: async (e: any) => { events = e; return rpc as any; },
      permissionRouter: router as any,
      onMonitor: vi.fn(),
      onResumePrompt: vi.fn(),
      windowSec: () => 86_400,
    });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    const respond = vi.fn();
    events.onServerRequest(5, 'item/commandExecution/requestApproval', { threadId: 't1', itemId: 'i1', command: 'rm -rf /', cwd: '/w' }, respond);
    await Promise.resolve();
    await Promise.resolve();

    expect(router.requestPermission).toHaveBeenCalledWith(expect.objectContaining({
      key: 'codex:t1',
      cwd: '/home/y/Project/mihomo-gui', // session cwd, from thread/resume — NOT the payload's '/w'
      input: expect.objectContaining({ command: 'rm -rf /', cwd: '/w' }), // command-execution cwd, untouched
    }));
    comp.stop();
  });

  it('clears the cached cwd on thread/archived, so a stray later event for the same id falls back instead of leaking a stale value', async () => {
    let events: any;
    const rpc = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'thread/loaded/list') return { data: ['t1'] };
        if (method === 'thread/resume') return { thread: { id: params.threadId }, cwd: '/home/y/Project/demo' };
        return {};
      }),
      notify: vi.fn(),
      close: vi.fn(),
    };
    const router = { requestPermission: vi.fn(async () => ({ decision: 'allow' })), cancel: vi.fn(() => 0) };
    const onMonitor = vi.fn();
    const comp = startCompanion({
      connect: async (e: any) => { events = e; return rpc as any; },
      permissionRouter: router as any,
      onMonitor,
      onResumePrompt: vi.fn(),
      windowSec: () => 86_400,
    });
    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();
    await Promise.resolve();

    events.onNotify('item/started', { threadId: 't1', item: { type: 'userMessage', content: [{ text: 'hi' }] } });
    expect(onMonitor).toHaveBeenLastCalledWith(
      { event: 'prompt', cwd: '/home/y/Project/demo', sessionId: 't1', prompt: 'hi' },
      'codex:t1',
    );

    events.onNotify('thread/archived', { threadId: 't1' });

    // A stray notification for the same (now-archived) threadId must not
    // resurrect the stale cached cwd — the map entry must be gone.
    events.onNotify('item/started', { threadId: 't1', item: { type: 'userMessage', content: [{ text: 'again' }] } });
    expect(onMonitor).toHaveBeenLastCalledWith(
      { event: 'prompt', cwd: 'codex:t1', sessionId: 't1', prompt: 'again' },
      'codex:t1',
    );

    comp.stop();
  });
});
