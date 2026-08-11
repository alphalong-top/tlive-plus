import { execFile as nodeExecFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect as netConnect } from 'node:net';
import { promisify } from 'node:util';
import { codexAppServerSockPath } from './spawn.js';

export const CODEX_LOCAL_DAEMON_ENV = 'CODEX_APP_SERVER_USE_LOCAL_DAEMON';
export const CODEX_WS_URL_ENV = 'CODEX_APP_SERVER_WS_URL';
export const CODEX_BRIDGE_HOST = '127.0.0.1';
// ponytail: fixed loopback port keeps launchd state simple; use a port file only if collisions become real.
export const CODEX_BRIDGE_PORT = 43873;
const BRIDGE_AGENT_LABEL = 'top.alphalong.tlive.codex-ws-bridge';
const LEGACY_ENV_AGENT_LABEL = 'top.alphalong.tlive.codex-shared-env';

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
  return join(userHome, 'Library', 'LaunchAgents', `${LEGACY_ENV_AGENT_LABEL}.plist`);
}

export function codexBridgeAgentPath(userHome = homedir()): string {
  return join(userHome, 'Library', 'LaunchAgents', `${BRIDGE_AGENT_LABEL}.plist`);
}

export function codexBridgeEntryPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), 'tlive-codex-bridge.mjs');
}

export function codexAppServerWsUrl(): string {
  return `ws://${CODEX_BRIDGE_HOST}:${CODEX_BRIDGE_PORT}`;
}

function xml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function writeCodexDesktopBridgeAgent(
  userHome = homedir(),
  codexHome?: string,
  entryPath = codexBridgeEntryPath(),
  nodePath = process.execPath,
): string {
  const path = codexBridgeAgentPath(userHome);
  const logPath = join(userHome, '.tlive', 'codex-ws-bridge.log');
  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(path, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${BRIDGE_AGENT_LABEL}</string>
  <key>ProgramArguments</key><array>
    <string>${xml(nodePath)}</string>
    <string>${xml(entryPath)}</string>
    <string>${xml(codexAppServerSockPath(codexHome))}</string>
    <string>${CODEX_BRIDGE_HOST}</string>
    <string>${CODEX_BRIDGE_PORT}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>2</integer>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${xml(logPath)}</string>
  <key>StandardErrorPath</key><string>${xml(logPath)}</string>
</dict></plist>
`);
  return path;
}

function userLaunchDomain(): string {
  const uid = process.getuid?.();
  if (uid === undefined) throw new Error('could not determine current user id');
  return `gui/${uid}`;
}

async function bootout(label: string): Promise<void> {
  try {
    await execFile('launchctl', userLaunchctlArgs(['bootout', `${userLaunchDomain()}/${label}`]));
  } catch {
    // Already unloaded.
  }
}

async function agentLoaded(label: string): Promise<boolean> {
  try {
    await execFile('launchctl', userLaunchctlArgs(['print', `${userLaunchDomain()}/${label}`]));
    return true;
  } catch {
    return false;
  }
}

function removeAgent(path: string): void {
  if (existsSync(path)) unlinkSync(path);
}

function bridgeListening(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = netConnect({ host: CODEX_BRIDGE_HOST, port: CODEX_BRIDGE_PORT });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function waitForBridge(): Promise<boolean> {
  for (let i = 0; i < 25; i++) {
    if (await bridgeListening()) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

export async function setCodexDesktopSharedEnv(enabled: boolean): Promise<void> {
  if (process.platform !== 'darwin') return;
  if (enabled) {
    await bootout(LEGACY_ENV_AGENT_LABEL);
    removeAgent(codexSharedEnvAgentPath());
    if (await agentLoaded(BRIDGE_AGENT_LABEL) && await bridgeListening()) {
      await execFile('launchctl', userLaunchctlArgs(['setenv', CODEX_WS_URL_ENV, codexAppServerWsUrl()]));
      await execFile('launchctl', userLaunchctlArgs(['unsetenv', CODEX_LOCAL_DAEMON_ENV]));
      return;
    }
    await bootout(BRIDGE_AGENT_LABEL);
    const path = writeCodexDesktopBridgeAgent();
    await execFile('launchctl', userLaunchctlArgs(['bootstrap', userLaunchDomain(), path]));
    if (!(await waitForBridge())) {
      await execFile('launchctl', userLaunchctlArgs(['unsetenv', CODEX_WS_URL_ENV]));
      throw new Error(`Codex App websocket bridge did not start on ${CODEX_BRIDGE_HOST}:${CODEX_BRIDGE_PORT}`);
    }
    await execFile('launchctl', userLaunchctlArgs(['setenv', CODEX_WS_URL_ENV, codexAppServerWsUrl()]));
    await execFile('launchctl', userLaunchctlArgs(['unsetenv', CODEX_LOCAL_DAEMON_ENV]));
  } else {
    await execFile('launchctl', userLaunchctlArgs(['unsetenv', CODEX_WS_URL_ENV]));
    await execFile('launchctl', userLaunchctlArgs(['unsetenv', CODEX_LOCAL_DAEMON_ENV]));
    await bootout(BRIDGE_AGENT_LABEL);
    await bootout(LEGACY_ENV_AGENT_LABEL);
    removeAgent(codexBridgeAgentPath());
    removeAgent(codexSharedEnvAgentPath());
  }
}

export async function codexDesktopSharedEnv(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  try {
    const { stdout } = await execFile('launchctl', userLaunchctlArgs(['getenv', CODEX_WS_URL_ENV]));
    return stdout.trim() === codexAppServerWsUrl() && await bridgeListening();
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
