import { execFile as nodeExecFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

export const CODEX_LOCAL_DAEMON_ENV = 'CODEX_APP_SERVER_USE_LOCAL_DAEMON';
const ENV_AGENT_LABEL = 'top.alphalong.tlive.codex-shared-env';

const execFile = promisify(nodeExecFile);

function userLaunchctlArgs(args: string[]): string[] {
  const uid = process.getuid?.();
  return uid === undefined ? args : ['asuser', String(uid), 'launchctl', ...args];
}

export function writeSharedDaemonConfig(home: string, enabled: boolean): string {
  const path = join(home, 'config.json');
  let cfg: Record<string, any> = {};
  if (existsSync(path)) {
    try { cfg = JSON.parse(readFileSync(path, 'utf-8')); } catch { cfg = {}; }
  } else {
    mkdirSync(home, { recursive: true });
  }
  cfg.codex = { ...(cfg.codex ?? {}), sharedDaemon: enabled };
  writeFileSync(path, JSON.stringify(cfg, null, 2));
  return path;
}

export function codexSharedEnvAgentPath(userHome = homedir()): string {
  return join(userHome, 'Library', 'LaunchAgents', `${ENV_AGENT_LABEL}.plist`);
}

function persistCodexDesktopSharedEnv(enabled: boolean): void {
  const path = codexSharedEnvAgentPath();
  if (!enabled) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${ENV_AGENT_LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>/bin/launchctl</string><string>setenv</string>
    <string>${CODEX_LOCAL_DAEMON_ENV}</string><string>1</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict></plist>
`);
}

export async function setCodexDesktopSharedEnv(enabled: boolean): Promise<void> {
  if (process.platform !== 'darwin') return;
  persistCodexDesktopSharedEnv(enabled);
  await execFile('launchctl', userLaunchctlArgs(enabled
    ? ['setenv', CODEX_LOCAL_DAEMON_ENV, '1']
    : ['unsetenv', CODEX_LOCAL_DAEMON_ENV]));
}

export async function codexDesktopSharedEnv(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  try {
    const { stdout } = await execFile('launchctl', userLaunchctlArgs(['getenv', CODEX_LOCAL_DAEMON_ENV]));
    return stdout.trim() === '1';
  } catch {
    return false;
  }
}

export async function bootstrapCodexManagedDaemon(): Promise<void> {
  await execFile('codex', ['app-server', 'daemon', 'bootstrap']);
}

export async function codexManagedDaemonVersion(): Promise<string | undefined> {
  try {
    const { stdout } = await execFile('codex', ['app-server', 'daemon', 'version']);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}
