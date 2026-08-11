// src/cli/subcommands/start.ts
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { defaultSocketPath, request } from '../../kernel/ipc/client.js';
import { printWebBanner } from '../web-url.js';
import { spawnDaemonDetached, daemonEntryPath } from '../../kernel/daemon/spawn.js';
import { waitUntilSocketFree } from '../../kernel/ipc/server.js';
import { isCurrentBuild } from '../../kernel/build-id.js';
import { loadConfig } from '../../kernel/config/loader.js';
import { setCodexDesktopSharedEnv } from '../../kernel/codex/shared-daemon.js';

export async function runStart(argv: string[]): Promise<void> {
  const home = process.env.TLIVE_HOME ?? join(homedir(), '.tlive');
  const sockPath = defaultSocketPath();
  const foreground = argv.includes('--foreground') || argv.includes('-F');

  if (loadConfig(home).codex?.sharedDaemon === true) {
    await setCodexDesktopSharedEnv(true).catch((error) => {
      process.stderr.write(`tlive: could not enable Codex App shared daemon: ${error instanceof Error ? error.message : String(error)}\n`);
    });
  }

  // A replaced global package can leave the old in-memory daemon serving IM.
  // Missing buildId means a pre-fingerprint daemon, so the first upgrade also restarts.
  let running: Awaited<ReturnType<typeof request>> | undefined;
  try {
    running = await request({ kind: 'daemon.status' }, { socketPath: sockPath, timeoutMs: 1000 });
  } catch {
    // Not running; continue to spawn.
  }
  if (running?.kind === 'daemon.status') {
    if (isCurrentBuild(running.buildId)) {
      process.stdout.write(`tlive daemon already running (pid ${running.pid})\n\ntlive web UI:\n`);
      await printWebBanner(home);
      return;
    }
    process.stdout.write(`tlive daemon build changed; restarting pid ${running.pid}\n`);
    await request({ kind: 'daemon.stop' }, { socketPath: sockPath, timeoutMs: 4000 });
    if (!(await waitUntilSocketFree(sockPath, 8000, 200))) {
      throw new Error('old daemon did not stop after a build update');
    }
  }

  const daemonEntry = daemonEntryPath();
  if (foreground) {
    spawn(process.execPath, [daemonEntry], { stdio: 'inherit' }).on('exit', (c) => process.exit(c ?? 0));
    return;
  }
  const pid = spawnDaemonDetached(home);
  if (pid === null) {
    process.stderr.write('tlive: daemon bundle not found. Run: npm run build\n');
    process.exit(1);
  }
  process.stdout.write(`tlive daemon started (pid ${pid})\n`);

  // Wait for the daemon to come up (token file is created on first start), then show the web entry.
  for (let i = 0; i < 25; i++) {
    try {
      await request({ kind: 'daemon.status' }, { socketPath: sockPath, timeoutMs: 500 });
      process.stdout.write('\ntlive web UI:\n');
      await printWebBanner(home);
      return;
    } catch { await new Promise((r) => setTimeout(r, 200)); }
  }
}
