import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CODEX_BRIDGE_PORT,
  CODEX_WS_URL_ENV,
  codexAppServerWsUrl,
  writeCodexDesktopBridgeAgent,
  writeSharedDaemonConfig,
} from '../shared-daemon.js';

describe('writeSharedDaemonConfig', () => {
  it('preserves existing config while enabling the shared daemon', () => {
    const home = mkdtempSync(join(tmpdir(), 'tlive-shared-'));
    writeFileSync(join(home, 'config.json'), JSON.stringify({ mode: 'full', codex: { autoRetry: { enabled: true } } }));

    writeSharedDaemonConfig(home, true);

    expect(JSON.parse(readFileSync(join(home, 'config.json'), 'utf-8'))).toEqual({
      mode: 'full',
      codex: { autoRetry: { enabled: true }, sharedDaemon: true },
    });
  });

  it('starts a durable loopback bridge for Codex App', () => {
    const home = mkdtempSync(join(tmpdir(), 'tlive-shared-app-'));
    const codexHome = join(home, '.codex');

    const path = writeCodexDesktopBridgeAgent(home, codexHome, '/tlive-codex-bridge.mjs', '/node');
    const plist = readFileSync(path, 'utf-8');

    expect(codexAppServerWsUrl()).toBe(`ws://127.0.0.1:${CODEX_BRIDGE_PORT}`);
    expect(plist).toContain('<string>/node</string>');
    expect(plist).toContain('<string>/tlive-codex-bridge.mjs</string>');
    expect(plist).toContain(`<string>${codexHome}/app-server-control/app-server-control.sock</string>`);
    expect(plist).toContain(`<string>${CODEX_BRIDGE_PORT}</string>`);
    expect(plist).toContain('<key>KeepAlive</key><true/>');
    expect(plist).not.toContain(CODEX_WS_URL_ENV);
    expect(plist).not.toContain('CODEX_APP_SERVER_USE_LOCAL_DAEMON');
  });
});
