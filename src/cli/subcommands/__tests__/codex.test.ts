import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  waitUntilSocketFree: vi.fn(),
  spawnDaemonDetached: vi.fn(),
  bootstrap: vi.fn(),
  setEnv: vi.fn(),
  writeConfig: vi.fn(),
  envStatus: vi.fn(),
  version: vi.fn(),
}));

vi.mock('../../../kernel/ipc/client.js', () => ({ defaultSocketPath: () => '/tlive.sock', request: mocks.request }));
vi.mock('../../../kernel/ipc/server.js', () => ({ waitUntilSocketFree: mocks.waitUntilSocketFree }));
vi.mock('../../../kernel/daemon/spawn.js', () => ({ spawnDaemonDetached: mocks.spawnDaemonDetached }));
vi.mock('../../../kernel/codex/spawn.js', () => ({ codexAppServerSockPath: () => '/codex.sock' }));
vi.mock('../../../kernel/config/loader.js', () => ({ loadConfig: () => ({ codex: { sharedDaemon: true } }) }));
vi.mock('../../../kernel/codex/shared-daemon.js', () => ({
  bootstrapCodexManagedDaemon: mocks.bootstrap,
  codexDesktopSharedEnv: mocks.envStatus,
  codexManagedDaemonVersion: mocks.version,
  setCodexDesktopSharedEnv: mocks.setEnv,
  writeSharedDaemonConfig: mocks.writeConfig,
}));

import { runCodex } from '../codex.js';

describe('tlive codex shared', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mocks.waitUntilSocketFree.mockResolvedValue(true);
    mocks.spawnDaemonDetached.mockReturnValue(42);
    mocks.writeConfig.mockReturnValue('/tlive/config.json');
    mocks.request
      .mockResolvedValueOnce({ kind: 'daemon.status', pid: 1 })
      .mockResolvedValueOnce({ kind: 'daemon.stopped' })
      .mockResolvedValueOnce({ kind: 'daemon.status', pid: 42 });
  });

  it('moves a running tlive onto the managed daemon', async () => {
    await runCodex(['shared', 'on']);

    expect(mocks.bootstrap).toHaveBeenCalledOnce();
    expect(mocks.setEnv).toHaveBeenCalledWith(true);
    expect(mocks.writeConfig).toHaveBeenCalledWith(expect.any(String), true);
    expect(mocks.spawnDaemonDetached).toHaveBeenCalledOnce();
  });

  it('persists an already-running managed daemon without restarting tlive', async () => {
    mocks.version.mockResolvedValue('{"status":"running"}');

    await runCodex(['shared', 'on']);

    expect(mocks.setEnv).toHaveBeenCalledWith(true);
    expect(mocks.writeConfig).toHaveBeenCalledWith(expect.any(String), true);
    expect(mocks.bootstrap).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.spawnDaemonDetached).not.toHaveBeenCalled();
  });
});
