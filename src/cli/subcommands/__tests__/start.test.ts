import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BUILD_ID } from '../../../kernel/build-id.js';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  waitUntilSocketFree: vi.fn(),
  spawnDaemonDetached: vi.fn(),
  printWebBanner: vi.fn(),
}));

vi.mock('../../../kernel/ipc/client.js', () => ({ defaultSocketPath: () => '/daemon.sock', request: mocks.request }));
vi.mock('../../../kernel/ipc/server.js', () => ({ waitUntilSocketFree: mocks.waitUntilSocketFree }));
vi.mock('../../../kernel/daemon/spawn.js', () => ({ daemonEntryPath: () => '/daemon.mjs', spawnDaemonDetached: mocks.spawnDaemonDetached }));
vi.mock('../../web-url.js', () => ({ printWebBanner: mocks.printWebBanner }));

import { runStart } from '../start.js';

describe('tlive start build handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.waitUntilSocketFree.mockResolvedValue(true);
    mocks.spawnDaemonDetached.mockReturnValue(22);
    mocks.printWebBanner.mockResolvedValue(undefined);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('keeps a daemon running the installed build', async () => {
    mocks.request.mockResolvedValue({ kind: 'daemon.status', pid: 11, uptimeMs: 1, buildId: BUILD_ID });

    await runStart([]);

    expect(mocks.spawnDaemonDetached).not.toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });

  it('restarts a pre-fingerprint daemon after an update', async () => {
    mocks.request
      .mockResolvedValueOnce({ kind: 'daemon.status', pid: 11, uptimeMs: 1 })
      .mockResolvedValueOnce({ kind: 'daemon.stopped' })
      .mockResolvedValueOnce({ kind: 'daemon.status', pid: 22, uptimeMs: 1, buildId: BUILD_ID });

    await runStart([]);

    expect(mocks.request).toHaveBeenNthCalledWith(2, { kind: 'daemon.stop' }, expect.any(Object));
    expect(mocks.waitUntilSocketFree).toHaveBeenCalledWith('/daemon.sock', 8000, 200);
    expect(mocks.spawnDaemonDetached).toHaveBeenCalledOnce();
  });
});

