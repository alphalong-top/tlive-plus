import { homedir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../../kernel/config/loader.js';
import {
  bootstrapCodexManagedDaemon,
  codexDesktopSharedEnv,
  codexManagedDaemonVersion,
  setCodexDesktopSharedEnv,
  writeSharedDaemonConfig,
} from '../../kernel/codex/shared-daemon.js';
import { codexAppServerSockPath } from '../../kernel/codex/spawn.js';
import { defaultSocketPath, request } from '../../kernel/ipc/client.js';
import { waitUntilSocketFree } from '../../kernel/ipc/server.js';
import { spawnDaemonDetached } from '../../kernel/daemon/spawn.js';

async function stopTlive(): Promise<boolean> {
  try {
    const status = await request({ kind: 'daemon.status' }, { timeoutMs: 1000 });
    if (status.kind !== 'daemon.status') return false;
    await request({ kind: 'daemon.stop' }, { timeoutMs: 4000 });
    if (!(await waitUntilSocketFree(defaultSocketPath(), 8000, 200))) {
      throw new Error('tlive daemon did not stop');
    }
    // A direct app-server child exits with tlive; an already-managed one stays.
    await waitUntilSocketFree(codexAppServerSockPath(), 3000, 200);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ECONNREFUSED') return false;
    throw error;
  }
}

async function startTlive(home: string): Promise<void> {
  const pid = spawnDaemonDetached(home);
  if (pid === null) throw new Error('daemon bundle not found; run `pnpm run build`');
  for (let i = 0; i < 25; i++) {
    try {
      const status = await request({ kind: 'daemon.status' }, { timeoutMs: 500 });
      if (status.kind === 'daemon.status') return;
    } catch { /* keep waiting */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`tlive daemon did not start (pid ${pid})`);
}

export async function runCodex(argv: string[]): Promise<void> {
  const [group, action] = argv;
  if (group !== 'shared' || !['on', 'off', 'status'].includes(action ?? '')) {
    process.stderr.write('Usage: tlive codex shared on|off|status\n');
    process.exitCode = 1;
    return;
  }

  const home = process.env.TLIVE_HOME ?? join(homedir(), '.tlive');
  if (action === 'status') {
    const configured = loadConfig(home).codex?.sharedDaemon === true;
    const env = await codexDesktopSharedEnv();
    const version = await codexManagedDaemonVersion();
    process.stdout.write(`codex shared daemon: ${configured ? 'enabled' : 'disabled'}\n`);
    process.stdout.write(`Codex App environment: ${env ? 'enabled' : 'disabled'}\n`);
    process.stdout.write(`managed daemon: ${version ?? 'not running or unavailable'}\n`);
    return;
  }

  if (process.platform !== 'darwin') {
    throw new Error('local Codex App shared-daemon setup is currently supported on macOS only');
  }

  if (action === 'off') {
    await setCodexDesktopSharedEnv(false);
    const path = writeSharedDaemonConfig(home, false);
    process.stdout.write(`Codex App shared daemon disabled (${path}).\nFully quit and reopen Codex App to apply it.\n`);
    return;
  }

  // The common retry path: bootstrap already succeeded, so do not bounce a
  // healthy tlive/Codex App pair just to persist the setting.
  if (await codexManagedDaemonVersion()) {
    await setCodexDesktopSharedEnv(true);
    const path = writeSharedDaemonConfig(home, true);
    process.stdout.write(`Codex App shared daemon enabled (${path}).\n`);
    process.stdout.write('Fully quit and reopen Codex App only if it was running before this command.\n');
    return;
  }

  const wasRunning = await stopTlive();
  try {
    await bootstrapCodexManagedDaemon();
    await setCodexDesktopSharedEnv(true);
    const path = writeSharedDaemonConfig(home, true);
    if (wasRunning) await startTlive(home);
    process.stdout.write(`Codex App shared daemon enabled (${path}).\n`);
    process.stdout.write('Fully quit and reopen Codex App, then run `tlive codex shared status`.\n');
  } catch (error) {
    if (wasRunning) await startTlive(home).catch(() => {});
    throw error;
  }
}
